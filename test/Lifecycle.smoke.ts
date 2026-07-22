import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

// Mirror of LifecycleModule.Status
const Status = { Manufactured: 0n, Certified: 1n, Placed: 2n } as const;

const CERT_HASH = ethers.id("cert:zirconia-lot-A");
const CONFORMITY_HASH = ethers.id("conformity:crown-42");
const PATIENT_COMMITMENT = ethers.id("salt42|patient-identity");

/**
 * Deploys the full stack and wires the roles the way the Ignition module will:
 * one authority, three permanent stores (passports, lots, credit), one module.
 * By default both the lab and the practitioner receive a generous credit
 * balance so lifecycle tests don't run out; credit-specific tests override this.
 */
async function deployStack(credits = 1000n) {
  const [admin, lab, practitioner, outsider] = await ethers.getSigners();

  const roles = await ethers.deployContract("CatentaRoles", [admin.address]);
  const passports = await ethers.deployContract("PassportNFT", [await roles.getAddress()]);
  const lots = await ethers.deployContract("MaterialLots", [await roles.getAddress()]);
  const credit = await ethers.deployContract("CatentaCredit", [await roles.getAddress()]);
  const lifecycle = await ethers.deployContract("LifecycleModule", [
    await roles.getAddress(),
    await passports.getAddress(),
    await lots.getAddress(),
    await credit.getAddress(),
  ]);

  const moduleAddress = await lifecycle.getAddress();
  await roles.grantRole(await roles.LAB_ROLE(), lab.address);
  await roles.grantRole(await roles.PRACTITIONER_ROLE(), practitioner.address);
  await roles.grantRole(await roles.PASSPORT_MINTER_ROLE(), moduleAddress);
  await roles.grantRole(await roles.PASSPORT_CONTROLLER_ROLE(), moduleAddress);
  await roles.grantRole(await roles.LOT_MINTER_ROLE(), moduleAddress);
  await roles.grantRole(await roles.LOT_BURNER_ROLE(), moduleAddress);
  await roles.grantRole(await roles.CREDIT_SPENDER_ROLE(), moduleAddress);
  // admin mints credits (the off-chain payment side is simulated here)
  await roles.grantRole(await roles.CREDIT_MINTER_ROLE(), admin.address);
  if (credits > 0n) {
    await credit.mintCredits(lab.address, credits);
    await credit.mintCredits(practitioner.address, credits);
  }

  return { roles, passports, lots, credit, lifecycle, admin, lab, practitioner, outsider };
}

describe("Catenta v0 - smoke", () => {
  it("runs the full lifecycle: lot -> passport -> handoff -> conformity -> placement", async () => {
    const { passports, lots, lifecycle, lab, practitioner } = await deployStack();

    // 1. the lab declares a lot of 1000 units
    await expect(lifecycle.connect(lab).declareLot(CERT_HASH, 1000n))
      .to.emit(lots, "LotDeclared")
      .withArgs(1n, lab.address, CERT_HASH, 1000n);
    expect(await lots["totalSupply(uint256)"](1n)).to.equal(1000n);

    // 2. minting a passport consumes 150 units of that lot, in the same tx.
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

    await expect(lifecycle.connect(practitioner).markPlaced(1n, PATIENT_COMMITMENT))
      .to.emit(lifecycle, "PlacedInMouth")
      .withArgs(1n, practitioner.address, PATIENT_COMMITMENT);
    expect(await lifecycle.statusOf(1n)).to.equal(Status.Placed);
    expect(await lifecycle.patientCommitmentOf(1n)).to.equal(PATIENT_COMMITMENT);
  });

  it("emits the burn of the consumed material through the ERC-1155 store", async () => {
    const { lots, lifecycle, lab } = await deployStack();
    await lifecycle.connect(lab).declareLot(CERT_HASH, 1000n);

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

  it("keeps the passport soulbound against a direct transfer", async () => {
    const { passports, lifecycle, lab, practitioner } = await deployStack();
    await lifecycle.connect(lab).declareLot(CERT_HASH, 100n);
    await lifecycle.connect(lab).mintPassport(1n, 10n, CONFORMITY_HASH);

    await expect(
      passports.connect(lab).transferFrom(lab.address, practitioner.address, 1n),
    ).to.be.revertedWithCustomError(passports, "Soulbound");
  });

  it("refuses a store write from anyone but a role holder", async () => {
    const { passports, roles, outsider } = await deployStack();

    await expect(
      passports.connect(outsider).mint(outsider.address, 1n, CONFORMITY_HASH),
    )
      .to.be.revertedWithCustomError(passports, "UnauthorizedRole")
      .withArgs(await roles.PASSPORT_MINTER_ROLE(), outsider.address);
  });

  it("lets a NEW module drive the SAME stores - the modularity claim", async () => {
    const { roles, passports, lots, credit, lifecycle, admin, lab, practitioner } =
      await deployStack();

    // a passport already exists, minted through the first module
    await lifecycle.connect(lab).declareLot(CERT_HASH, 500n);
    await lifecycle.connect(lab).mintPassport(1n, 50n, CONFORMITY_HASH);

    // deploy a second module and move the module roles over to it
    const nextModule = await ethers.deployContract("LifecycleModule", [
      await roles.getAddress(),
      await passports.getAddress(),
      await lots.getAddress(),
      await credit.getAddress(),
    ]);
    const nextAddress = await nextModule.getAddress();
    const oldAddress = await lifecycle.getAddress();

    for (const role of [
      await roles.PASSPORT_MINTER_ROLE(),
      await roles.PASSPORT_CONTROLLER_ROLE(),
      await roles.LOT_MINTER_ROLE(),
      await roles.LOT_BURNER_ROLE(),
      await roles.CREDIT_SPENDER_ROLE(),
    ]) {
      await roles.connect(admin).grantRole(role, nextAddress);
      await roles.connect(admin).revokeRole(role, oldAddress);
    }

    // the existing passport and the remaining material are untouched
    expect(await passports.ownerOf(1n)).to.equal(lab.address);
    expect(await lots["totalSupply(uint256)"](1n)).to.equal(450n);

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
  it("grants the initial 100 credits once, and refuses a second grant", async () => {
    const { credit, admin, lab } = await deployStack(0n);

    await expect(credit.connect(admin).grantInitialCredits(lab.address))
      .to.emit(credit, "InitialCreditsGranted")
      .withArgs(lab.address, 100n);
    expect(await credit.balanceOf(lab.address)).to.equal(100n);
    expect(await credit.hasReceivedInitial(lab.address)).to.equal(true);

    await expect(
      credit.connect(admin).grantInitialCredits(lab.address),
    ).to.be.revertedWithCustomError(credit, "InitialAlreadyGranted");
  });

  it("burns exactly one credit per useful action", async () => {
    // fund with a known, small balance to observe the decrements
    const { credit, lifecycle, lab, practitioner } = await deployStack(0n);
    const c = await credit.getAddress();
    void c;
    // admin already holds CREDIT_MINTER_ROLE via deployStack
    const [admin] = await ethers.getSigners();
    await credit.connect(admin).mintCredits(lab.address, 10n);
    await credit.connect(admin).mintCredits(practitioner.address, 10n);

    await lifecycle.connect(lab).declareLot(CERT_HASH, 100n); // -1
    expect(await credit.balanceOf(lab.address)).to.equal(9n);

    await lifecycle.connect(lab).mintPassport(1n, 10n, CONFORMITY_HASH); // -1
    expect(await credit.balanceOf(lab.address)).to.equal(8n);

    await lifecycle.connect(lab).initiateHandoff(1n, practitioner.address); // -1 (lab)
    expect(await credit.balanceOf(lab.address)).to.equal(7n);

    // acceptHandoff is free: the recipient does not pay to receive
    await lifecycle.connect(practitioner).acceptHandoff(1n);
    expect(await credit.balanceOf(practitioner.address)).to.equal(10n);

    await lifecycle.connect(practitioner).attestConformity(1n); // -1
    expect(await credit.balanceOf(practitioner.address)).to.equal(9n);

    await lifecycle.connect(practitioner).markPlaced(1n, PATIENT_COMMITMENT); // -1
    expect(await credit.balanceOf(practitioner.address)).to.equal(8n);
  });

  it("blocks an action when the actor is out of credits", async () => {
    const { credit, lifecycle, lab } = await deployStack(0n);
    // lab has zero credits
    await expect(lifecycle.connect(lab).declareLot(CERT_HASH, 100n))
      .to.be.revertedWithCustomError(credit, "InsufficientCredits")
      .withArgs(lab.address, 0n, 1n);
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
    const { credit, lifecycle, admin, lab } = await deployStack(0n);
    // lab has no credits, yet a free pilot must still work
    await expect(lifecycle.connect(admin).setActionCost(0n))
      .to.emit(lifecycle, "ActionCostUpdated")
      .withArgs(1n, 0n);

    await lifecycle.connect(lab).declareLot(CERT_HASH, 100n);
    expect(await credit.balanceOf(lab.address)).to.equal(0n);
  });

  it("mints credits only for the minter role", async () => {
    const { credit, outsider } = await deployStack(0n);
    await expect(
      credit.connect(outsider).mintCredits(outsider.address, 100n),
    ).to.be.revertedWithCustomError(credit, "UnauthorizedRole");
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
