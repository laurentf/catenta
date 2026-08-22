import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

// Mirror of LifecycleModule.Status
const Status = { Manufactured: 0n, Certified: 1n, Placed: 2n } as const;

const CERT_HASH = ethers.id("cert:zirconia-lot-A");
// Le lot se décrit lui-même : matière et unité, choisies dans le sélecteur
// hors chaîne mais inscrites sur le lot.
const MATERIAL = "Zircone Y-TZP A2";
const UNIT = "g";
const CONFORMITY_HASH = ethers.id("conformity:crown-42");
const PATIENT_COMMITMENT = ethers.id("salt42|patient-identity");
// Notation FDI (ISO 3950) : quadrant 2, dent 6 — première molaire
// supérieure gauche.
const TOOTH = 26n;
// Délai de transfert d'administration, court en test.
const ADMIN_DELAY = 3600n;

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

  const roles = await ethers.deployContract("CatentaRoles", [admin.address, ADMIN_DELAY]);
  const passports = await ethers.deployContract("PassportNFT", [await roles.getAddress()]);
  const lots = await ethers.deployContract("MaterialLots", [await roles.getAddress()]);
  const actors = await ethers.deployContract("ActorRegistry", [await roles.getAddress()]);
  const credit = await ethers.deployContract("CatentaCredit", [await roles.getAddress()]);
  const lifecycle = await ethers.deployContract("LifecycleModule", [
    await roles.getAddress(),
    await passports.getAddress(),
    await lots.getAddress(),
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

  return {
    roles, passports, lots, actors, credit, lifecycle,
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
  await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, produced);
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
    await expect(lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 1000n))
      .to.emit(lots, "LotDeclared")
      .withArgs(1n, manufacturer.address, MATERIAL, UNIT, CERT_HASH, 1000n);
    expect(await lots["totalSupply(uint256)"](1n)).to.equal(1000n);
    expect(await lots.balanceOf(manufacturer.address, 1n)).to.equal(1000n);

    await expect(
      lifecycle.connect(lab).declareLot(MATERIAL, UNIT, CERT_HASH, 10n),
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
    const mintTx = lifecycle.connect(lab).mintPassport(0n, 1n, 150n, CONFORMITY_HASH);
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
    await expect(lifecycle.connect(lab).mintPassport(0n, 1n, 150n, CONFORMITY_HASH))
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
    await lifecycle.connect(lab).mintPassport(0n, 1n, 10n, CONFORMITY_HASH);
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
    await lifecycle.connect(lab).mintPassport(0n, 1n, 10n, CONFORMITY_HASH);

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
    const { roles, passports, lots, credit, lifecycle, admin, lab, practitioner } = stack;

    // a passport already exists, minted through the first module
    await supplyLab(stack, 500n, 200n);
    await lifecycle.connect(lab).mintPassport(0n, 1n, 50n, CONFORMITY_HASH);

    // deploy a second module and move the module roles over to it
    const nextModule = await ethers.deployContract("LifecycleModule", [
      await roles.getAddress(),
      await passports.getAddress(),
      await lots.getAddress(),
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
    await nextModule.connect(lab).mintPassport(0n, 1n, 50n, CONFORMITY_HASH);
    expect(await passports.ownerOf(2n)).to.equal(lab.address);
    expect(await lots["totalSupply(uint256)"](1n)).to.equal(400n);

    await nextModule.connect(lab).initiateHandoff(1n, practitioner.address);
    await nextModule.connect(practitioner).acceptHandoff(1n);
    expect(await passports.ownerOf(1n)).to.equal(practitioner.address);

    // the old module is now powerless
    await expect(
      lifecycle.connect(lab).mintPassport(0n, 1n, 10n, CONFORMITY_HASH),
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

    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n); // -1
    await lifecycle.connect(manufacturer).declareShipment(1n, 100n, distributor.address); // -1
    expect(await credit.balanceOf(manufacturer.address)).to.equal(8n);

    // accepting is free: the sender already paid for the shipment
    await lifecycle.connect(distributor).acceptShipment(1n);
    expect(await credit.balanceOf(distributor.address)).to.equal(10n);

    await lifecycle.connect(distributor).declareShipment(1n, 60n, lab.address); // -1
    expect(await credit.balanceOf(distributor.address)).to.equal(9n);
    await lifecycle.connect(lab).acceptShipment(2n);
    expect(await credit.balanceOf(lab.address)).to.equal(10n);

    await lifecycle.connect(lab).mintPassport(0n, 1n, 10n, CONFORMITY_HASH); // -1
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
    await expect(lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n))
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

    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n);
    expect(await credit.balanceOf(manufacturer.address)).to.equal(0n);
  });

  it("mints credits only for the minter role", async () => {
    const { credit, outsider } = await deployStack(0n);
    await expect(
      credit.connect(outsider).mintCredits(outsider.address, 100n),
    ).to.be.revertedWithCustomError(credit, "UnauthorizedRole");
  });
});

describe("Catenta v0 - un lot se décrit lui-même", () => {
  it("porte sa matière et son unité, lisibles sans aucun fichier annexe", async () => {
    const { lots, lifecycle, manufacturer } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 1000n);

    const lot = await lots.lotOf(1n);
    expect(lot.material).to.equal(MATERIAL);
    // « 1000 » seul ne veut rien dire ; « 1000 g » veut dire quelque chose
    expect(lot.unit).to.equal(UNIT);
    expect(await lots["totalSupply(uint256)"](1n)).to.equal(1000n);
  });

  it("accepte deux unités différentes pour deux matières différentes", async () => {
    const { lots, lifecycle, manufacturer } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 1000n);
    await lifecycle
      .connect(manufacturer)
      .declareLot("Disilicate A2 LT", "lingotins", CERT_HASH, 10n);

    expect((await lots.lotOf(2n)).unit).to.equal("lingotins");
    // rien ne relie les deux lots : chacun porte sa propre vérité
    expect((await lots.lotOf(1n)).unit).to.equal("g");
  });

  it("exige une matière et une unité, et les garde courtes", async () => {
    const { lifecycle, manufacturer } = await deployStack();

    await expect(
      lifecycle.connect(manufacturer).declareLot("", UNIT, CERT_HASH, 10n),
    ).to.be.revertedWithCustomError(lifecycle, "InvalidText");
    await expect(
      lifecycle.connect(manufacturer).declareLot(MATERIAL, "", CERT_HASH, 10n),
    ).to.be.revertedWithCustomError(lifecycle, "InvalidText");
    // au-delà de 31 octets une chaîne quitte son slot : on borne
    await expect(
      lifecycle.connect(manufacturer).declareLot("x".repeat(32), UNIT, CERT_HASH, 10n),
    ).to.be.revertedWithCustomError(lifecycle, "InvalidText");
  });
});

describe("Catenta v0 - material custody chain", () => {
  it("refuses a direct transfer: material moves only through an accepted shipment", async () => {
    const { lots, lifecycle, manufacturer, distributor } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n);

    await expect(
      lots
        .connect(manufacturer)
        .safeTransferFrom(manufacturer.address, distributor.address, 1n, 10n, "0x"),
    ).to.be.revertedWithCustomError(lots, "LotNotTransferable");
  });

  it("refuses to move custody without the custodian role", async () => {
    const { lots, lifecycle, roles, manufacturer, distributor, outsider } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n);

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
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n);

    await expect(lifecycle.connect(manufacturer).declareShipment(1n, 10n, outsider.address))
      .to.be.revertedWithCustomError(lifecycle, "RecipientNotEligible")
      .withArgs(outsider.address);
  });

  it("refuses to ship more material than the sender holds", async () => {
    const { lifecycle, manufacturer, distributor } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n);

    await expect(lifecycle.connect(manufacturer).declareShipment(1n, 101n, distributor.address))
      .to.be.revertedWithCustomError(lifecycle, "InsufficientMaterial")
      .withArgs(manufacturer.address, 1n, 101n);
  });

  it("lets either party cancel a shipment nobody accepted, and only once", async () => {
    const { lots, lifecycle, manufacturer, distributor, outsider } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 40n, distributor.address);

    // Un tiers n'a rien à défaire ici : ni expéditeur, ni destinataire.
    await expect(lifecycle.connect(outsider).cancelShipment(1n))
      .to.be.revertedWithCustomError(lifecycle, "NotShipmentParty");

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
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n);
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
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 40n, distributor.address);
    await lifecycle.connect(distributor).acceptShipment(1n);

    await expect(
      lifecycle.connect(distributor).acceptShipment(1n),
    ).to.be.revertedWithCustomError(lifecycle, "ShipmentSettled");
  });

  it("lets a distributor sell straight to a practitioner (chairside milling, 2b)", async () => {
    const { lots, lifecycle, manufacturer, distributor, practitioner } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 100n, distributor.address);
    await lifecycle.connect(distributor).acceptShipment(1n);

    await lifecycle.connect(distributor).declareShipment(1n, 25n, practitioner.address);
    await lifecycle.connect(practitioner).acceptShipment(2n);
    expect(await lots.balanceOf(practitioner.address, 1n)).to.equal(25n);
  });

  it("lets material go back up the chain, without any order behind it", async () => {
    const stack = await deployStack();
    const { lots, lifecycle, distributor, lab } = stack;
    await supplyLab(stack, 500n, 200n);

    // Le retour n'est pas un cas particulier : le sens n'est jamais contraint,
    // seule la garde l'est. Le labo rend 80 au distributeur, qui accepte comme
    // n'importe quel destinataire — c'est ce qui rendra le renvoi d'un lot
    // rappelé possible sans une ligne de contrat de plus.
    const back = await lifecycle.connect(lab).declareShipment.staticCall(1n, 80n, distributor.address);
    await lifecycle.connect(lab).declareShipment(1n, 80n, distributor.address);
    await lifecycle.connect(distributor).acceptShipment(back);

    expect(await lots.balanceOf(lab.address, 1n)).to.equal(120n);
    expect(await lots.balanceOf(distributor.address, 1n)).to.equal(380n);
  });

  it("lets a laboratory consume material it received but never produced", async () => {
    const stack = await deployStack();
    const { lots, passports, lifecycle, manufacturer, lab } = stack;
    await supplyLab(stack, 500n, 200n);

    await lifecycle.connect(lab).mintPassport(0n, 1n, 60n, CONFORMITY_HASH);
    expect(await passports.ownerOf(1n)).to.equal(lab.address);
    expect(await lots.balanceOf(lab.address, 1n)).to.equal(140n);
    // the passport points back at the lot, and the lot at its manufacturer
    expect((await passports.traitsOf(1n)).lotId).to.equal(1n);
    expect((await lots.lotOf(1n)).manufacturer).to.equal(manufacturer.address);
  });
});

describe("Catenta v0 - actor registry", () => {
  it("lets a registrar name an actor, and only a registrar", async () => {
    const { actors, roles, admin, lab, outsider } = await deployStack();

    await expect(actors.connect(admin).setLabel(lab.address, "Laboratoire Dupont", "812456903"))
      .to.emit(actors, "ActorLabelled")
      .withArgs(lab.address, "Laboratoire Dupont", "812456903");

    const actor = await actors.actorOf(lab.address);
    expect(actor.label).to.equal("Laboratoire Dupont");
    expect(actor.siren).to.equal("812456903");

    await expect(actors.connect(outsider).setLabel(lab.address, "Pirate", ""))
      .to.be.revertedWithCustomError(actors, "UnauthorizedRole")
      .withArgs(await roles.REGISTRAR_ROLE(), outsider.address);
  });

  it("refuses to name a manufacturer — la règle est dans le contrat, pas dans l'UI", async () => {
    const { actors, admin, manufacturer } = await deployStack();

    await expect(actors.connect(admin).setLabel(manufacturer.address, "Ivoclar", "500000000"))
      .to.be.revertedWithCustomError(actors, "ManufacturerNotLabelled")
      .withArgs(manufacturer.address);
  });

  it("exige un libellé, et un SIREN de neuf caractères s'il est fourni", async () => {
    const { actors, admin, lab } = await deployStack();

    await expect(
      actors.connect(admin).setLabel(lab.address, "", "812456903"),
    ).to.be.revertedWithCustomError(actors, "InvalidLabel");
    await expect(
      actors.connect(admin).setLabel(lab.address, "Labo", "1234"),
    ).to.be.revertedWithCustomError(actors, "InvalidSiren");
    // le SIREN reste facultatif — un acteur étranger n'en a pas
    await actors.connect(admin).setLabel(lab.address, "Labo", "");
    expect((await actors.actorOf(lab.address)).siren).to.equal("");
  });

  it("cesse de nommer un acteur qui devient fabricant", async () => {
    const { actors, roles, admin, lab } = await deployStack();
    await actors.connect(admin).setLabel(lab.address, "Laboratoire Dupont", "812456903");
    expect((await actors.actorOf(lab.address)).label).to.equal("Laboratoire Dupont");

    // La règle est vérifiée à l'ÉCRITURE et à la LECTURE : sans le second
    // contrôle, un laboratoire déjà nommé garderait son nom en devenant
    // fabricant, et la neutralité concurrentielle sauterait selon l'ordre
    // des deux actes.
    await roles.connect(admin).grantRole(await roles.MANUFACTURER_ROLE(), lab.address);
    expect((await actors.actorOf(lab.address)).label).to.equal("");
  });

  it("efface un libellé posé par erreur", async () => {
    const { actors, admin, lab } = await deployStack();
    await actors.connect(admin).setLabel(lab.address, "Erreur de saisie", "");

    await expect(actors.connect(admin).clearLabel(lab.address))
      .to.emit(actors, "ActorLabelCleared")
      .withArgs(lab.address);
    expect((await actors.actorOf(lab.address)).label).to.equal("");
  });
});

describe("Catenta v0 - material orders", () => {
  const Order = { Pending: 0n, Fulfilled: 1n, Refused: 2n, Cancelled: 3n };

  it("va de la commande à la livraison, sans jamais imposer la garde", async () => {
    const stack = await deployStack();
    const { lots, lifecycle, manufacturer, distributor, lab } = stack;
    // le distributeur a du stock
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 1000n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 1000n, distributor.address);
    await lifecycle.connect(distributor).acceptShipment(1n);

    await expect(lifecycle.connect(lab).placeMaterialOrder(distributor.address, MATERIAL, 250n))
      .to.emit(lifecycle, "MaterialOrdered")
      .withArgs(1n, lab.address, distributor.address, MATERIAL, 250n, 0n);

    const shipmentId = await lifecycle
      .connect(distributor)
      .fulfilMaterialOrder.staticCall(1n, 1n);
    await lifecycle.connect(distributor).fulfilMaterialOrder(1n, 1n);

    const order = await lifecycle.materialOrderOf(1n);
    expect(order.status).to.equal(Order.Fulfilled);
    expect(order.shipmentId).to.equal(shipmentId);

    // honorer ne livre pas : le laboratoire doit toujours réceptionner
    expect(await lots.balanceOf(lab.address, 1n)).to.equal(0n);
    await lifecycle.connect(lab).acceptShipment(shipmentId);
    expect(await lots.balanceOf(lab.address, 1n)).to.equal(250n);
  });

  it("trace la cascade vers le fabricant sans la décider", async () => {
    const { lifecycle, manufacturer, distributor, lab } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 1000n);

    // le laboratoire commande à son distributeur, qui n'a rien en stock
    await lifecycle.connect(lab).placeMaterialOrder(distributor.address, MATERIAL, 250n);
    // le distributeur commande en amont, en gardant le lien vers la demande initiale
    await expect(lifecycle.connect(distributor).escalateMaterialOrder(1n, manufacturer.address, 500n))
      .to.emit(lifecycle, "MaterialOrdered")
      .withArgs(2n, distributor.address, manufacturer.address, MATERIAL, 500n, 1n);

    // la commande d'origine reste ouverte : rien n'est promis tant que rien n'arrive
    expect((await lifecycle.materialOrderOf(1n)).status).to.equal(Order.Pending);
    expect((await lifecycle.materialOrderOf(2n)).parentOrderId).to.equal(1n);
  });

  it("refuse et annule avec un motif lisible", async () => {
    const { lifecycle, manufacturer, distributor, lab } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 100n);

    await lifecycle.connect(lab).placeMaterialOrder(distributor.address, MATERIAL, 250n);
    await expect(lifecycle.connect(distributor).refuseMaterialOrder(1n, "Rupture de stock"))
      .to.emit(lifecycle, "MaterialOrderSettled")
      .withArgs(1n, Order.Refused, "Rupture de stock");
    expect((await lifecycle.materialOrderOf(1n)).reason).to.equal("Rupture de stock");

    await lifecycle.connect(lab).placeMaterialOrder(distributor.address, MATERIAL, 10n);
    await expect(
      lifecycle.connect(lab).cancelMaterialOrder(2n, ""),
    ).to.be.revertedWithCustomError(lifecycle, "InvalidText");
    await lifecycle.connect(lab).cancelMaterialOrder(2n, "Approvisionné ailleurs");
    expect((await lifecycle.materialOrderOf(2n)).status).to.equal(Order.Cancelled);

    // une commande réglée ne se règle pas deux fois
    await expect(
      lifecycle.connect(distributor).refuseMaterialOrder(2n, "trop tard"),
    ).to.be.revertedWithCustomError(lifecycle, "OrderSettled");
  });

  it("rouvre la commande si le fournisseur annule son expédition", async () => {
    const { lots, lifecycle, manufacturer, distributor, lab } = await deployStack();
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 1000n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 1000n, distributor.address);
    await lifecycle.connect(distributor).acceptShipment(1n);

    await lifecycle.connect(lab).placeMaterialOrder(distributor.address, MATERIAL, 250n);
    await lifecycle.connect(distributor).fulfilMaterialOrder(1n, 1n);
    expect((await lifecycle.materialOrderOf(1n)).status).to.equal(Order.Fulfilled);

    // Le fournisseur se ravise et annule l'expédition qu'il venait de créer.
    // Sans le lien retour, la commande resterait « honorée » alors que rien
    // n'a été livré : le registre affirmerait une livraison inexistante.
    await lifecycle.connect(distributor).cancelShipment(2n);

    const order = await lifecycle.materialOrderOf(1n);
    expect(order.status).to.equal(Order.Pending);
    expect(order.shipmentId).to.equal(0n);
    expect(await lots.balanceOf(lab.address, 1n)).to.equal(0n);

    // et elle reste honorable ensuite
    await lifecycle.connect(distributor).fulfilMaterialOrder(1n, 1n);
    await lifecycle.connect(lab).acceptShipment(3n);
    expect(await lots.balanceOf(lab.address, 1n)).to.equal(250n);
  });

  it("refuse de livrer une matière autre que celle commandée", async () => {
    const { lifecycle, manufacturer, distributor, lab } = await deployStack();
    // le distributeur ne détient que du titane
    await lifecycle.connect(manufacturer).declareLot("Titane grade 5", "pièces", CERT_HASH, 100n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 100n, distributor.address);
    await lifecycle.connect(distributor).acceptShipment(1n);

    // le laboratoire a commandé de la zircone
    await lifecycle.connect(lab).placeMaterialOrder(distributor.address, MATERIAL, 10n);
    await expect(lifecycle.connect(distributor).fulfilMaterialOrder(1n, 1n))
      .to.be.revertedWithCustomError(lifecycle, "MaterialMismatch")
      .withArgs(1n, MATERIAL, "Titane grade 5");
  });
});

describe("Catenta v0 - prosthesis requests (étape 0)", () => {
  const Request = { Pending: 0n, Accepted: 1n, Fulfilled: 2n, Refused: 3n, Cancelled: 4n };

  it("va de la prescription au passeport", async () => {
    const stack = await deployStack();
    const { lifecycle, passports, lab, practitioner } = stack;
    await supplyLab(stack, 500n, 200n);

    await expect(
      lifecycle
        .connect(practitioner)
        .requestProsthesis(lab.address, MATERIAL, TOOTH, "A2", "Couronne céramo-céramique"),
    )
      .to.emit(lifecycle, "ProsthesisRequested")
      .withArgs(1n, practitioner.address, lab.address, MATERIAL, TOOTH);

    const pending = await lifecycle.prosthesisRequestOf(1n);
    expect(pending.shade).to.equal("A2");
    expect(pending.description).to.equal("Couronne céramo-céramique");
    expect(pending.tooth).to.equal(TOOTH);

    await lifecycle.connect(lab).acceptProsthesisRequest(1n);
    expect((await lifecycle.prosthesisRequestOf(1n)).status).to.equal(Request.Accepted);

    // la fabrication honore la demande et l'y relie
    await lifecycle.connect(lab).mintPassport(1n, 1n, 60n, CONFORMITY_HASH);
    const done = await lifecycle.prosthesisRequestOf(1n);
    expect(done.status).to.equal(Request.Fulfilled);
    expect(done.tokenId).to.equal(1n);
    expect(await passports.ownerOf(1n)).to.equal(lab.address);
  });

  it("ne fabrique pas contre une demande non acceptée", async () => {
    const stack = await deployStack();
    const { lifecycle, lab, practitioner } = stack;
    await supplyLab(stack, 500n, 200n);
    await lifecycle
      .connect(practitioner)
      .requestProsthesis(lab.address, MATERIAL, TOOTH, "A2", "Couronne");

    await expect(lifecycle.connect(lab).mintPassport(1n, 1n, 60n, CONFORMITY_HASH))
      .to.be.revertedWithCustomError(lifecycle, "WrongRequestStatus")
      .withArgs(1n, Request.Accepted, Request.Pending);
  });

  it("laisse refuser et annuler, motif à l'appui", async () => {
    const stack = await deployStack();
    const { lifecycle, lab, practitioner } = stack;

    await lifecycle
      .connect(practitioner)
      .requestProsthesis(lab.address, MATERIAL, TOOTH, "A2", "Couronne");
    await expect(lifecycle.connect(lab).refuseProsthesisRequest(1n, "Teinte indisponible"))
      .to.emit(lifecycle, "ProsthesisRequestUpdated")
      .withArgs(1n, Request.Refused, "Teinte indisponible");

    // annulable même après acceptation : un patient annule son rendez-vous
    await lifecycle
      .connect(practitioner)
      .requestProsthesis(lab.address, MATERIAL, 36n, "A3", "Bridge 3 éléments");
    await lifecycle.connect(lab).acceptProsthesisRequest(2n);
    await lifecycle.connect(practitioner).cancelProsthesisRequest(2n, "Patient désiste");
    expect((await lifecycle.prosthesisRequestOf(2n)).status).to.equal(Request.Cancelled);
  });

  it("borne les textes libres et valide la dent", async () => {
    const { lifecycle, lab, practitioner } = await deployStack();

    await expect(
      lifecycle.connect(practitioner).requestProsthesis(lab.address, MATERIAL, 99n, "A2", "x"),
    ).to.be.revertedWithCustomError(lifecycle, "InvalidTooth");
    await expect(
      lifecycle.connect(practitioner).requestProsthesis(lab.address, MATERIAL, TOOTH, "", "x"),
    ).to.be.revertedWithCustomError(lifecycle, "InvalidText");
    await expect(
      lifecycle
        .connect(practitioner)
        .requestProsthesis(lab.address, MATERIAL, TOOTH, "A2", "x".repeat(201)),
    ).to.be.revertedWithCustomError(lifecycle, "InvalidText");
  });
});

describe("Catenta v0 - réentrance sur l'émission", () => {
  it("refuse deux prothèses pour une seule prescription, même via onERC721Received", async () => {
    const stack = await deployStack();
    const { roles, passports, lifecycle, credit, admin, manufacturer, distributor, practitioner } =
      stack;

    // Un laboratoire qui est un CONTRAT, et qui rappelle le module depuis le
    // callback ERC-721 déclenché par _safeMint.
    const attacker = await ethers.deployContract("ReentrantLab", [await lifecycle.getAddress()]);
    const attackerAddress = await attacker.getAddress();
    await roles.connect(admin).grantRole(await roles.LAB_ROLE(), attackerAddress);
    await credit.connect(admin).mintCredits(attackerAddress, 100n);

    // On lui livre de la matière (transferCustody passe par _update, donc
    // aucun callback ERC-1155 n'est requis côté attaquant).
    await lifecycle.connect(manufacturer).declareLot(MATERIAL, UNIT, CERT_HASH, 1000n);
    await lifecycle.connect(manufacturer).declareShipment(1n, 1000n, distributor.address);
    await lifecycle.connect(distributor).acceptShipment(1n);
    await lifecycle.connect(distributor).declareShipment(1n, 500n, attackerAddress);
    await attacker.acceptShipment(2n);

    // Une prescription, une seule.
    await lifecycle
      .connect(practitioner)
      .requestProsthesis(attackerAddress, MATERIAL, TOOTH, "A2", "Couronne");
    await attacker.acceptRequest(1n);

    await attacker.attack(1n, 1n, 50n, CONFORMITY_HASH);

    // La tentative de réentrance a échoué, et une seule prothèse existe.
    expect(await attacker.reenteredOk()).to.equal(0n);
    expect(await passports.mintedCount()).to.equal(1n);

    const request = await lifecycle.prosthesisRequestOf(1n);
    expect(request.status).to.equal(2n); // Fulfilled
    expect(request.tokenId).to.equal(1n);
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

describe("Catenta v0 - correctifs d'audit", () => {
  it("refuse une garde qui viendrait de l'adresse zéro : la garde ne frappe pas", async () => {
    const { roles, lots, admin, outsider } = await deployStack();
    // Un module qui ne porte QUE la garde, sans le droit de frappe.
    await roles.connect(admin).grantRole(await roles.LOT_CUSTODIAN_ROLE(), outsider.address);
    expect(await roles.hasRole(await roles.LOT_MINTER_ROLE(), outsider.address)).to.equal(false);

    // `_update` est le point d'entrée brut d'ERC-1155 : from == 0 vaut frappe,
    // to == 0 vaut destruction. Les deux doivent être fermés.
    await expect(
      lots.connect(outsider).transferCustody(ethers.ZeroAddress, outsider.address, 1n, 999n),
    ).to.be.revertedWithCustomError(lots, "NotACustodyTransfer");
    await expect(
      lots.connect(outsider).transferCustody(outsider.address, ethers.ZeroAddress, 1n, 999n),
    ).to.be.revertedWithCustomError(lots, "NotACustodyTransfer");

    expect(await lots.balanceOf(outsider.address, 1n)).to.equal(0n);
  });

  it("refuse d'accepter une remise armée avant la pose : la garde vaut à l'instant de l'effet", async () => {
    const stack = await deployStack();
    const { passports, lifecycle, lab, practitioner } = stack;
    await supplyLab(stack, 1000n, 400n);
    await lifecycle.connect(lab).mintPassport(0n, 1n, 10n, CONFORMITY_HASH);
    await lifecycle.connect(lab).initiateHandoff(1n, practitioner.address);
    await lifecycle.connect(practitioner).acceptHandoff(1n);
    await lifecycle.connect(practitioner).attestConformity(1n);

    // On arme pendant que la prothèse est encore Certified : autorisé.
    await lifecycle.connect(practitioner).initiateHandoff(1n, lab.address);
    // Puis on pose. L'autorisation armée existe toujours côté store.
    await lifecycle.connect(practitioner).markPlaced(1n, TOOTH, PATIENT_COMMITMENT);
    expect(await passports.pendingHandoff(1n)).to.equal(lab.address);

    // Elle ne doit plus produire d'effet : une prothèse en bouche ne bouge pas.
    await expect(
      lifecycle.connect(lab).acceptHandoff(1n),
    ).to.be.revertedWithCustomError(lifecycle, "PassportLocked");
    expect(await passports.ownerOf(1n)).to.equal(practitioner.address);
  });

  it("laisse le destinataire refuser une expédition, et rouvre la commande", async () => {
    const stack = await deployStack();
    const { lifecycle, distributor, lab } = stack;
    await supplyLab(stack, 1000n, 400n);

    // Le labo commande au distributeur, qui honore : une expédition naît.
    await lifecycle.connect(lab).placeMaterialOrder(distributor.address, MATERIAL, 100n);
    const shipmentId = await lifecycle
      .connect(distributor)
      .fulfilMaterialOrder.staticCall(1n, 1n);
    await lifecycle.connect(distributor).fulfilMaterialOrder(1n, 1n);
    expect((await lifecycle.materialOrderOf(1n)).status).to.equal(1n); // Fulfilled

    // Un tiers ne peut rien annuler.
    await expect(
      lifecycle.connect(stack.outsider).cancelShipment(shipmentId),
    ).to.be.revertedWithCustomError(lifecycle, "NotShipmentParty");

    // Le DESTINATAIRE refuse : la matière n'a jamais bougé, et la commande
    // redevient en attente plutôt que de rester « honorée » sans livraison.
    await expect(lifecycle.connect(lab).cancelShipment(shipmentId))
      .to.emit(lifecycle, "ShipmentCancelled")
      .withArgs(shipmentId, 1n, lab.address);
    expect((await lifecycle.materialOrderOf(1n)).status).to.equal(0n); // Pending
    expect((await lifecycle.materialOrderOf(1n)).shipmentId).to.equal(0n);
  });
});
