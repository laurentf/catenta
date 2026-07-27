import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

// Mirror of LifecycleModule.Status
const Status = { Manufactured: 0n, Certified: 1n, Placed: 2n } as const;

const CERT_HASH = ethers.id("cert:zirconia-lot-A");
// La première matière enregistrée par le fabricant dans deployStack.
const MATERIAL_ID = 1n;
const CONFORMITY_HASH = ethers.id("conformity:crown-42");
const PATIENT_COMMITMENT = ethers.id("salt42|patient-identity");
// Notation FDI (ISO 3950) : quadrant 2, dent 6 — première molaire
// supérieure gauche.
const TOOTH = 26n;

/** Rôles modules — la liste que l'Ignition accorde, et qu'un remplacement déplace. */
const MODULE_ROLES = [
  "PASSPORT_MINTER_ROLE",
  "PASSPORT_CONTROLLER_ROLE",
  "LOT_MINTER_ROLE",
  "LOT_BURNER_ROLE",
  "LOT_CUSTODIAN_ROLE",
  "CREDIT_SPENDER_ROLE",
] as const;

/**
 * Deploys the full stack and wires the roles the way the Ignition module will:
 * one authority, three permanent stores (passports, lots, credit), one module.
 * Every actor of the functional flow gets a generous credit balance so
 * lifecycle tests don't run out; credit-specific tests override this.
 */
async function deployStack(credits = 1000n) {
  const [admin, lab, practitioner, outsider, , , , manufacturer, distributor] =
    await ethers.getSigners();

  const roles = await ethers.deployContract("CatentaRoles", [admin.address]);
  const passports = await ethers.deployContract("PassportNFT", [await roles.getAddress()]);
  const lots = await ethers.deployContract("MaterialLots", [await roles.getAddress()]);
  const catalog = await ethers.deployContract("MaterialCatalog", [await roles.getAddress()]);
  const credit = await ethers.deployContract("CatentaCredit", [await roles.getAddress()]);
  const lifecycle = await ethers.deployContract("LifecycleModule", [
    await roles.getAddress(),
    await passports.getAddress(),
    await lots.getAddress(),
    await catalog.getAddress(),
    await credit.getAddress(),
  ]);

  const moduleAddress = await lifecycle.getAddress();
  await roles.grantRole(await roles.MANUFACTURER_ROLE(), manufacturer.address);
  await roles.grantRole(await roles.DISTRIBUTOR_ROLE(), distributor.address);
  await roles.grantRole(await roles.LAB_ROLE(), lab.address);
  await roles.grantRole(await roles.PRACTITIONER_ROLE(), practitioner.address);
  for (const role of MODULE_ROLES) {
    await roles.grantRole(await roles[role](), moduleAddress);
  }
  // admin mints credits (the off-chain payment side is simulated here)
  await roles.grantRole(await roles.CREDIT_MINTER_ROLE(), admin.address);
  if (credits > 0n) {
    for (const actor of [manufacturer, distributor, lab, practitioner]) {
      await credit.mintCredits(actor.address, credits);
    }
  }

  // Le fabricant décrit sa matière : sans entrée au catalogue, aucun lot.
  await catalog.connect(manufacturer).registerMaterial("Zircone Y-TZP A2", "g");

  return {
    roles, passports, lots, catalog, credit, lifecycle,
    admin, manufacturer, distributor, lab, practitioner, outsider,
  };
}

/** Raccourci de lecture : la garde d'un acteur sur le lot 1. */
async function stackBalance(lifecycle: any, account: string) {
  const lots = await ethers.getContractAt("MaterialLots", await lifecycle.LOTS());
  return lots.balanceOf(account, 1n);
}

/**
 * Le parcours amont du doc fonctionnel : le fabricant déclare le lot, l'expédie
 * au distributeur, qui en revend une partie au laboratoire. Chaque maillon
 * ACCEPTE : rien n'est poussé sur personne.
 */
async function supplyLab(
  stack: Awaited<ReturnType<typeof deployStack>>,
  produced: bigint,
  soldToLab: bigint,
) {
  const { lifecycle, manufacturer, distributor, lab } = stack;
  await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, produced);
  const toDistributor = await lifecycle.connect(manufacturer).declareShipment.staticCall(
    1n, produced, distributor.address,
  );
  await lifecycle.connect(manufacturer).declareShipment(1n, produced, distributor.address);
  await lifecycle.connect(distributor).acceptShipment(toDistributor);

  const toLab = await lifecycle.connect(distributor).declareShipment.staticCall(
    1n, soldToLab, lab.address,
  );
  await lifecycle.connect(distributor).declareShipment(1n, soldToLab, lab.address);
  await lifecycle.connect(lab).acceptShipment(toLab);
}

describe("Catenta v0 - smoke", () => {
  it("runs the full chain: manufacturer -> distributor -> lab -> practitioner -> patient", async () => {
    const stack = await deployStack();
    const { passports, lots, lifecycle, manufacturer, distributor, lab, practitioner } = stack;

    // 1. the MANUFACTURER declares a lot of 1000 units. A laboratory cannot:
    // it receives material, it never brings it into existence.
    await expect(lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 1000n))
      .to.emit(lots, "LotDeclared")
      .withArgs(1n, manufacturer.address, MATERIAL_ID, CERT_HASH, 1000n);
    expect(await lots["totalSupply(uint256)"](1n)).to.equal(1000n);
    expect(await lots.balanceOf(manufacturer.address, 1n)).to.equal(1000n);

    await expect(
      lifecycle.connect(lab).declareLot(MATERIAL_ID, CERT_HASH, 10n),
    ).to.be.revertedWithCustomError(lifecycle, "UnauthorizedRole");

    // 2. shipment to the distributor: declared, then ACCEPTED on arrival.
    await expect(lifecycle.connect(manufacturer).declareShipment(1n, 1000n, distributor.address))
      .to.emit(lifecycle, "ShipmentDeclared")
      .withArgs(1n, 1n, manufacturer.address, distributor.address, 1000n);
    // custody has NOT moved yet: responsibility starts, the material has not
    expect(await lots.balanceOf(manufacturer.address, 1n)).to.equal(1000n);

    await expect(lifecycle.connect(distributor).acceptShipment(1n))
      .to.emit(lots, "TransferSingle")
      .withArgs(await lifecycle.getAddress(), manufacturer.address, distributor.address, 1n, 1000n);
    expect(await lots.balanceOf(distributor.address, 1n)).to.equal(1000n);
    expect(await lots.balanceOf(manufacturer.address, 1n)).to.equal(0n);

    // 3. the distributor resells part of the lot to the laboratory
    await lifecycle.connect(distributor).declareShipment(1n, 400n, lab.address);
    // only the designated recipient accepts — the sender cannot self-deliver
    await expect(
      lifecycle.connect(distributor).acceptShipment(2n),
    ).to.be.revertedWithCustomError(lifecycle, "NotShipmentRecipient");
    await lifecycle.connect(lab).acceptShipment(2n);
    expect(await lots.balanceOf(lab.address, 1n)).to.equal(400n);
    expect(await lots.balanceOf(distributor.address, 1n)).to.equal(600n);
    // the origin never moves: a recall walks back to the manufacturer
    expect((await lots.lotOf(1n)).manufacturer).to.equal(manufacturer.address);

    // 4. minting a passport consumes 150 units of that lot, in the same tx.
    // Two events, two layers, no overlap: the store announces the issuance and
    // its frozen traits, the module announces the material that went into it.
    const mintTx = lifecycle.connect(lab).mintPassport(1n, 150n, CONFORMITY_HASH);
    await expect(mintTx)
      .to.emit(passports, "PassportIssued")
      .withArgs(1n, lab.address, 1n, CONFORMITY_HASH);
    await expect(mintTx)
      .to.emit(lifecycle, "MaterialConsumed")
      .withArgs(1n, 1n, 150n);

    expect(await lots["totalSupply(uint256)"](1n)).to.equal(850n);
    expect(await passports.ownerOf(1n)).to.equal(lab.address);

    const traits = await passports.traitsOf(1n);
    expect(traits.lotId).to.equal(1n);
    expect(traits.conformityHash).to.equal(CONFORMITY_HASH);
    // la matière consommée est un trait FIGÉ, pas seulement un event : elle se
    // relit sans aucun getLogs, donc sans dépendre d'un RPC généreux
    expect(traits.quantity).to.equal(150n);

    // 3. two-step handoff to the practitioner
    await expect(lifecycle.connect(lab).initiateHandoff(1n, practitioner.address))
      .to.emit(passports, "HandoffArmed")
      .withArgs(1n, lab.address, practitioner.address);
    expect(await passports.pendingHandoff(1n)).to.equal(practitioner.address);

    // acceptance emits no bespoke event: the ERC-721 Transfer IS the fact
    await expect(lifecycle.connect(practitioner).acceptHandoff(1n))
      .to.emit(passports, "Transfer")
      .withArgs(lab.address, practitioner.address, 1n);
    expect(await passports.ownerOf(1n)).to.equal(practitioner.address);
    // the authorization is single-use: consumed by the transfer itself
    expect(await passports.pendingHandoff(1n)).to.equal(ethers.ZeroAddress);

    // 4. conformity, then placement
    await expect(lifecycle.connect(practitioner).attestConformity(1n))
      .to.emit(lifecycle, "ConformityAttested")
      .withArgs(1n, practitioner.address);
    expect(await lifecycle.statusOf(1n)).to.equal(Status.Certified);

    await expect(lifecycle.connect(practitioner).markPlaced(1n, TOOTH, PATIENT_COMMITMENT))
      .to.emit(lifecycle, "PlacedInMouth")
      .withArgs(1n, practitioner.address, TOOTH, PATIENT_COMMITMENT);
    expect(await lifecycle.statusOf(1n)).to.equal(Status.Placed);
    expect(await lifecycle.patientCommitmentOf(1n)).to.equal(PATIENT_COMMITMENT);

    // l'acte clinique se relit en un appel : qui, quand, quelle dent
    const placement = await lifecycle.placementOf(1n);
    expect(placement.practitioner).to.equal(practitioner.address);
    expect(placement.tooth).to.equal(TOOTH);
    expect(placement.placedAt).to.be.greaterThan(0n);
  });

  it("emits the burn of the consumed material through the ERC-1155 store", async () => {
    const stack = await deployStack();
    const { lots, lifecycle, lab } = stack;
    await supplyLab(stack, 1000n, 400n);

    // no bespoke "MaterialBurned" event: TransferSingle to address(0) is it
    await expect(lifecycle.connect(lab).mintPassport(1n, 150n, CONFORMITY_HASH))
      .to.emit(lots, "TransferSingle")
      .withArgs(
        await lifecycle.getAddress(),
        lab.address,
        ethers.ZeroAddress,
        1n,
        150n,
      );
  });

  it("refuses a tooth number that is not valid FDI notation", async () => {
    const stack = await deployStack();
    const { lifecycle, lab, practitioner } = stack;
    await supplyLab(stack, 100n, 50n);
    await lifecycle.connect(lab).mintPassport(1n, 10n, CONFORMITY_HASH);
    await lifecycle.connect(lab).initiateHandoff(1n, practitioner.address);
    await lifecycle.connect(practitioner).acceptHandoff(1n);
    await lifecycle.connect(practitioner).attestConformity(1n);

    // 9 n'est pas un quadrant, 20 n'est pas une position
    for (const bad of [9n, 20n, 0n, 99n]) {
      await expect(lifecycle.connect(practitioner).markPlaced(1n, bad, PATIENT_COMMITMENT))
        .to.be.revertedWithCustomError(lifecycle, "InvalidTooth")
        .withArgs(bad);
    }
    await lifecycle.connect(practitioner).markPlaced(1n, 48n, PATIENT_COMMITMENT);
    expect((await lifecycle.placementOf(1n)).tooth).to.equal(48n);
  });

  it("keeps the passport soulbound against a direct transfer", async () => {
    const stack = await deployStack();
    const { passports, lifecycle, lab, practitioner } = stack;
    await supplyLab(stack, 100n, 50n);
    await lifecycle.connect(lab).mintPassport(1n, 10n, CONFORMITY_HASH);

    await expect(
      passports.connect(lab).transferFrom(lab.address, practitioner.address, 1n),
    ).to.be.revertedWithCustomError(passports, "Soulbound");
  });

  it("refuses a store write from anyone but a role holder", async () => {
    const { passports, roles, outsider } = await deployStack();

    await expect(
      passports.connect(outsider).mint(outsider.address, 1n, 10n, CONFORMITY_HASH),
    )
      .to.be.revertedWithCustomError(passports, "UnauthorizedRole")
      .withArgs(await roles.PASSPORT_MINTER_ROLE(), outsider.address);
  });

  it("lets a NEW module drive the SAME stores - the modularity claim", async () => {
    const stack = await deployStack();
    const { roles, passports, lots, catalog, credit, lifecycle, admin, lab, practitioner } = stack;

    // a passport already exists, minted through the first module
    await supplyLab(stack, 500n, 200n);
    await lifecycle.connect(lab).mintPassport(1n, 50n, CONFORMITY_HASH);

    // deploy a second module and move the module roles over to it
    const nextModule = await ethers.deployContract("LifecycleModule", [
      await roles.getAddress(),
      await passports.getAddress(),
      await lots.getAddress(),
      await catalog.getAddress(),
      await credit.getAddress(),
    ]);
    const nextAddress = await nextModule.getAddress();
    const oldAddress = await lifecycle.getAddress();

    for (const name of MODULE_ROLES) {
      const role = await roles[name]();
      await roles.connect(admin).grantRole(role, nextAddress);
      await roles.connect(admin).revokeRole(role, oldAddress);
    }

    // the existing passport and the remaining material are untouched
    expect(await passports.ownerOf(1n)).to.equal(lab.address);
    expect(await lots["totalSupply(uint256)"](1n)).to.equal(450n);
    expect(await lots.balanceOf(lab.address, 1n)).to.equal(150n);

    // and the new module drives them: it mints a second passport from the
    // lot declared through the old one, and moves the first one
    await nextModule.connect(lab).mintPassport(1n, 50n, CONFORMITY_HASH);
    expect(await passports.ownerOf(2n)).to.equal(lab.address);
    expect(await lots["totalSupply(uint256)"](1n)).to.equal(400n);

    await nextModule.connect(lab).initiateHandoff(1n, practitioner.address);
    await nextModule.connect(practitioner).acceptHandoff(1n);
    expect(await passports.ownerOf(1n)).to.equal(practitioner.address);

    // the old module is now powerless
    await expect(
      lifecycle.connect(lab).mintPassport(1n, 10n, CONFORMITY_HASH),
    ).to.be.revertedWithCustomError(passports, "UnauthorizedRole");
  });
});

describe("Catenta v0 - usage credit ($CATENTA)", () => {
  it("mints credits on demand, with no special first-time allocation", async () => {
    const { credit, admin, lab } = await deployStack(0n);

    // Créditer un acteur, c'est un mint. Pas de « premiers crédits » à part,
    // donc rien à suivre par adresse et rien qui puisse se réclamer deux fois.
    await expect(credit.connect(admin).mintCredits(lab.address, 100n))
      .to.emit(credit, "CreditsMinted")
      .withArgs(lab.address, 100n);
    expect(await credit.balanceOf(lab.address)).to.equal(100n);

    await credit.connect(admin).mintCredits(lab.address, 40n);
    expect(await credit.balanceOf(lab.address)).to.equal(140n);
  });

  it("burns exactly one credit per useful action", async () => {
    // fund with a known, small balance to observe the decrements
    const { credit, lifecycle, admin, manufacturer, distributor, lab, practitioner } =
      await deployStack(0n);
    for (const actor of [manufacturer, distributor, lab, practitioner]) {
      await credit.connect(admin).mintCredits(actor.address, 10n);
    }

    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n); // -1
    await lifecycle.connect(manufacturer).declareShipment(1n, 100n, distributor.address); // -1
    expect(await credit.balanceOf(manufacturer.address)).to.equal(8n);

    // accepting is free: the sender already paid for the shipment
    await lifecycle.connect(distributor).acceptShipment(1n);
    expect(await credit.balanceOf(distributor.address)).to.equal(10n);

    await lifecycle.connect(distributor).declareShipment(1n, 60n, lab.address); // -1
    expect(await credit.balanceOf(distributor.address)).to.equal(9n);
    await lifecycle.connect(lab).acceptShipment(2n);
    expect(await credit.balanceOf(lab.address)).to.equal(10n);

    await lifecycle.connect(lab).mintPassport(1n, 10n, CONFORMITY_HASH); // -1
    expect(await credit.balanceOf(lab.address)).to.equal(9n);

    await lifecycle.connect(lab).initiateHandoff(1n, practitioner.address); // -1 (lab)
    expect(await credit.balanceOf(lab.address)).to.equal(8n);

    // acceptHandoff is free: the recipient does not pay to receive
    await lifecycle.connect(practitioner).acceptHandoff(1n);
    expect(await credit.balanceOf(practitioner.address)).to.equal(10n);

    await lifecycle.connect(practitioner).attestConformity(1n); // -1
    expect(await credit.balanceOf(practitioner.address)).to.equal(9n);

    await lifecycle.connect(practitioner).markPlaced(1n, TOOTH, PATIENT_COMMITMENT); // -1
    expect(await credit.balanceOf(practitioner.address)).to.equal(8n);
  });

  it("blocks an action when the actor is out of credits", async () => {
    const { credit, lifecycle, manufacturer } = await deployStack(0n);
    // the manufacturer has zero credits
    await expect(lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n))
      .to.be.revertedWithCustomError(credit, "InsufficientCredits")
      .withArgs(manufacturer.address, 0n, 1n);
  });

  it("is non-transferable: no market, no price, by construction", async () => {
    const { credit, lab, practitioner } = await deployStack(0n);
    const [admin] = await ethers.getSigners();
    await credit.connect(admin).mintCredits(lab.address, 5n);

    await expect(
      credit.connect(lab).transfer(practitioner.address, 1n),
    ).to.be.revertedWithCustomError(credit, "CreditsNotTransferable");
  });

  it("lets the admin waive charging by setting the cost to zero", async () => {
    const { credit, lifecycle, admin, manufacturer } = await deployStack(0n);
    // the manufacturer has no credits, yet a free pilot must still work
    await expect(lifecycle.connect(admin).setActionCost(0n))
      .to.emit(lifecycle, "ActionCostUpdated")
      .withArgs(1n, 0n);

    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);
    expect(await credit.balanceOf(manufacturer.address)).to.equal(0n);
  });

  it("mints credits only for the minter role", async () => {
    const { credit, outsider } = await deployStack(0n);
    await expect(
      credit.connect(outsider).mintCredits(outsider.address, 100n),
    ).to.be.revertedWithCustomError(credit, "UnauthorizedRole");
  });
});

describe("Catenta v0 - material catalogue", () => {
  it("lets a manufacturer describe its own materials, and nobody else", async () => {
    const { catalog, roles, manufacturer, lab } = await deployStack();

    await expect(catalog.connect(manufacturer).registerMaterial("Disilicate A2 LT", "lingotins"))
      .to.emit(catalog, "MaterialRegistered")
      .withArgs(2n, manufacturer.address, "Disilicate A2 LT", "lingotins");
    expect(await catalog.materialCount()).to.equal(2n);

    const material = await catalog.materialOf(2n);
    expect(material.name).to.equal("Disilicate A2 LT");
    // l'unité est ON-CHAIN : c'est elle qui rend une quantité lisible
    expect(material.unit).to.equal("lingotins");
    expect(material.active).to.equal(true);

    await expect(catalog.connect(lab).registerMaterial("Zircone", "g"))
      .to.be.revertedWithCustomError(catalog, "UnauthorizedRole")
      .withArgs(await roles.MANUFACTURER_ROLE(), lab.address);
  });

  it("requires both a name and a unit", async () => {
    const { catalog, manufacturer } = await deployStack();
    await expect(
      catalog.connect(manufacturer).registerMaterial("", "g"),
    ).to.be.revertedWithCustomError(catalog, "EmptyField");
    await expect(
      catalog.connect(manufacturer).registerMaterial("Zircone", ""),
    ).to.be.revertedWithCustomError(catalog, "EmptyField");
  });

  it("binds a lot to its material, and refuses someone else's", async () => {
    const { catalog, lots, lifecycle, roles, admin, manufacturer, distributor } =
      await deployStack();

    // a second manufacturer with its own catalogue entry
    await roles.connect(admin).grantRole(await roles.MANUFACTURER_ROLE(), distributor.address);
    await catalog.connect(distributor).registerMaterial("Cobalt-chrome", "g");

    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);
    expect((await lots.lotOf(1n)).materialId).to.equal(MATERIAL_ID);

    // declaring a lot of a material one does not own is refused
    await expect(lifecycle.connect(manufacturer).declareLot(2n, CERT_HASH, 100n))
      .to.be.revertedWithCustomError(lifecycle, "NotMaterialOwner")
      .withArgs(2n, manufacturer.address);
  });

  it("stops new lots of a discontinued material without rewriting the old ones", async () => {
    const { catalog, lots, lifecycle, manufacturer, lab } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);

    await expect(catalog.connect(manufacturer).setMaterialActive(1n, false))
      .to.emit(catalog, "MaterialActiveUpdated")
      .withArgs(1n, false);

    await expect(lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 50n))
      .to.be.revertedWithCustomError(lifecycle, "MaterialDiscontinued")
      .withArgs(1n);

    // the lot declared before stays perfectly readable, material included
    const lot = await lots.lotOf(1n);
    expect(lot.materialId).to.equal(1n);
    expect((await catalog.materialOf(lot.materialId)).name).to.equal("Zircone Y-TZP A2");

    // and only its owner may flip it back
    await expect(
      catalog.connect(lab).setMaterialActive(1n, true),
    ).to.be.revertedWithCustomError(catalog, "NotMaterialOwner");
    await catalog.connect(manufacturer).setMaterialActive(1n, true);
    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 50n);
  });

  it("refuses a lot from a material that does not exist", async () => {
    const { catalog, lifecycle, manufacturer } = await deployStack();
    await expect(lifecycle.connect(manufacturer).declareLot(99n, CERT_HASH, 10n))
      .to.be.revertedWithCustomError(catalog, "UnknownMaterial")
      .withArgs(99n);
  });
});

describe("Catenta v0 - material custody chain", () => {
  it("refuses a direct transfer: material moves only through an accepted shipment", async () => {
    const { lots, lifecycle, manufacturer, distributor } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);

    await expect(
      lots
        .connect(manufacturer)
        .safeTransferFrom(manufacturer.address, distributor.address, 1n, 10n, "0x"),
    ).to.be.revertedWithCustomError(lots, "LotNotTransferable");
  });

  it("refuses to move custody without the custodian role", async () => {
    const { lots, lifecycle, roles, manufacturer, distributor, outsider } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);

    await expect(
      lots
        .connect(outsider)
        .transferCustody(manufacturer.address, distributor.address, 1n, 10n),
    )
      .to.be.revertedWithCustomError(lots, "UnauthorizedRole")
      .withArgs(await roles.LOT_CUSTODIAN_ROLE(), outsider.address);
  });

  it("refuses a shipment to an actor who is not approved to hold material", async () => {
    const { lifecycle, manufacturer, outsider } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);

    await expect(lifecycle.connect(manufacturer).declareShipment(1n, 10n, outsider.address))
      .to.be.revertedWithCustomError(lifecycle, "RecipientNotEligible")
      .withArgs(outsider.address);
  });

  it("refuses to ship more material than the sender holds", async () => {
    const { lifecycle, manufacturer, distributor } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);

    await expect(lifecycle.connect(manufacturer).declareShipment(1n, 101n, distributor.address))
      .to.be.revertedWithCustomError(lifecycle, "InsufficientMaterial")
      .withArgs(manufacturer.address, 1n, 101n);
  });

  it("lets the sender cancel a shipment nobody accepted, and only once", async () => {
    const { lots, lifecycle, manufacturer, distributor } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 40n, distributor.address);

    await expect(lifecycle.connect(distributor).cancelShipment(1n))
      .to.be.revertedWithCustomError(lifecycle, "NotShipmentSender");

    await expect(lifecycle.connect(manufacturer).cancelShipment(1n))
      .to.emit(lifecycle, "ShipmentCancelled")
      .withArgs(1n, 1n, manufacturer.address);

    // cancelled means cancelled: the recipient can no longer take custody
    await expect(
      lifecycle.connect(distributor).acceptShipment(1n),
    ).to.be.revertedWithCustomError(lifecycle, "ShipmentSettled");
    expect(await lots.balanceOf(manufacturer.address, 1n)).to.equal(100n);
  });

  it("keeps the custody history readable from storage alone", async () => {
    const { lifecycle, manufacturer, distributor, lab } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 100n, distributor.address);
    await lifecycle.connect(distributor).acceptShipment(1n);
    await lifecycle.connect(distributor).declareShipment(1n, 30n, lab.address);
    await lifecycle.connect(distributor).cancelShipment(2n); // erreur de saisie
    await lifecycle.connect(distributor).declareShipment(1n, 40n, lab.address);
    await lifecycle.connect(lab).acceptShipment(3n);

    // Trois expéditions, trois issues distinctes — sans lire un seul event.
    const Shipment = { Pending: 0n, Accepted: 1n, Cancelled: 2n };
    const history = [];
    for (let i = 1n; i <= (await lifecycle.shipmentCount()); i++) {
      history.push(await lifecycle.shipmentOf(i));
    }
    expect(history.map((s) => s.status)).to.deep.equal([
      Shipment.Accepted,
      Shipment.Cancelled,
      Shipment.Accepted,
    ]);
    // et l'annulée n'a déplacé aucune matière
    expect(history[1].quantity).to.equal(30n);
    expect(await stackBalance(lifecycle, lab.address)).to.equal(40n);
  });

  it("cannot be accepted twice", async () => {
    const { lifecycle, manufacturer, distributor } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 40n, distributor.address);
    await lifecycle.connect(distributor).acceptShipment(1n);

    await expect(
      lifecycle.connect(distributor).acceptShipment(1n),
    ).to.be.revertedWithCustomError(lifecycle, "ShipmentSettled");
  });

  it("lets a distributor sell straight to a practitioner (chairside milling, 2b)", async () => {
    const { lots, lifecycle, manufacturer, distributor, practitioner } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL_ID, CERT_HASH, 100n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 100n, distributor.address);
    await lifecycle.connect(distributor).acceptShipment(1n);

    await lifecycle.connect(distributor).declareShipment(1n, 25n, practitioner.address);
    await lifecycle.connect(practitioner).acceptShipment(2n);
    expect(await lots.balanceOf(practitioner.address, 1n)).to.equal(25n);
  });

  it("lets a laboratory consume material it received but never produced", async () => {
    const stack = await deployStack();
    const { lots, passports, lifecycle, manufacturer, lab } = stack;
    await supplyLab(stack, 500n, 200n);

    await lifecycle.connect(lab).mintPassport(1n, 60n, CONFORMITY_HASH);
    expect(await passports.ownerOf(1n)).to.equal(lab.address);
    expect(await lots.balanceOf(lab.address, 1n)).to.equal(140n);
    // the passport points back at the lot, and the lot at its manufacturer
    expect((await passports.traitsOf(1n)).lotId).to.equal(1n);
    expect((await lots.lotOf(1n)).manufacturer).to.equal(manufacturer.address);
  });
});

describe("Catenta v0 - delegated onboarding (REGISTRAR_ROLE)", () => {
  it("lets a registrar onboard actors without holding DEFAULT_ADMIN", async () => {
    const { roles, admin, outsider } = await deployStack(0n);
    const [, , , , registrar, newLab] = await ethers.getSigners();

    // the root appoints a registrar (only DEFAULT_ADMIN can)
    await roles.connect(admin).grantRole(await roles.REGISTRAR_ROLE(), registrar.address);
    expect(await roles.hasRole(await roles.REGISTRAR_ROLE(), registrar.address)).to.equal(true);
    // the registrar is NOT a super-admin
    expect(await roles.hasRole(await roles.DEFAULT_ADMIN_ROLE(), registrar.address)).to.equal(false);

    // the registrar can onboard a lab (LAB_ROLE is admined by REGISTRAR_ROLE)
    await roles.connect(registrar).grantRole(await roles.LAB_ROLE(), newLab.address);
    expect(await roles.hasRole(await roles.LAB_ROLE(), newLab.address)).to.equal(true);

    // but the registrar cannot appoint another registrar (that is the root's job)
    await expect(
      roles.connect(registrar).grantRole(await roles.REGISTRAR_ROLE(), outsider.address),
    ).to.be.revertedWithCustomError(roles, "AccessControlUnauthorizedAccount");
  });

  it("keeps sensitive roles under the root, not the registrar", async () => {
    const { roles, admin, outsider } = await deployStack(0n);
    const [, , , , registrar] = await ethers.getSigners();
    await roles.connect(admin).grantRole(await roles.REGISTRAR_ROLE(), registrar.address);

    // a registrar cannot grant the regulator role...
    await expect(
      roles.connect(registrar).grantRole(await roles.REGULATOR_ROLE(), outsider.address),
    ).to.be.revertedWithCustomError(roles, "AccessControlUnauthorizedAccount");
    // ...nor the credit minter role
    await expect(
      roles.connect(registrar).grantRole(await roles.CREDIT_MINTER_ROLE(), outsider.address),
    ).to.be.revertedWithCustomError(roles, "AccessControlUnauthorizedAccount");
    // the root can
    await roles.connect(admin).grantRole(await roles.REGULATOR_ROLE(), outsider.address);
    expect(await roles.hasRole(await roles.REGULATOR_ROLE(), outsider.address)).to.equal(true);
  });

  it("supports several credit minters without touching DEFAULT_ADMIN", async () => {
    const { roles, credit, admin } = await deployStack(0n);
    const [, lab, , , op2] = await ethers.getSigners();
    // a second billing operator, minter only
    await roles.connect(admin).grantRole(await roles.CREDIT_MINTER_ROLE(), op2.address);
    await credit.connect(op2).mintCredits(lab.address, 40n);
    expect(await credit.balanceOf(lab.address)).to.equal(40n);
    expect(await roles.hasRole(await roles.DEFAULT_ADMIN_ROLE(), op2.address)).to.equal(false);
  });
});
