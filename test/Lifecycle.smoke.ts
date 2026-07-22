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
 * one authority, two permanent stores, one replaceable module.
 */
async function deployStack() {
  const [admin, lab, practitioner, outsider] = await ethers.getSigners();

  const roles = await ethers.deployContract("CatentaRoles", [admin.address]);
  const passports = await ethers.deployContract("PassportNFT", [await roles.getAddress()]);
  const lots = await ethers.deployContract("MaterialLots", [await roles.getAddress()]);
  const lifecycle = await ethers.deployContract("LifecycleModule", [
    await roles.getAddress(),
    await passports.getAddress(),
    await lots.getAddress(),
  ]);

  const moduleAddress = await lifecycle.getAddress();
  await roles.grantRole(await roles.LAB_ROLE(), lab.address);
  await roles.grantRole(await roles.PRACTITIONER_ROLE(), practitioner.address);
  await roles.grantRole(await roles.PASSPORT_MINTER_ROLE(), moduleAddress);
  await roles.grantRole(await roles.PASSPORT_CONTROLLER_ROLE(), moduleAddress);
  await roles.grantRole(await roles.LOT_MINTER_ROLE(), moduleAddress);
  await roles.grantRole(await roles.LOT_BURNER_ROLE(), moduleAddress);

  return { roles, passports, lots, lifecycle, admin, lab, practitioner, outsider };
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
    const { roles, passports, lots, lifecycle, admin, lab, practitioner } =
      await deployStack();

    // a passport already exists, minted through the first module
    await lifecycle.connect(lab).declareLot(CERT_HASH, 500n);
    await lifecycle.connect(lab).mintPassport(1n, 50n, CONFORMITY_HASH);

    // deploy a second module and move the module roles over to it
    const nextModule = await ethers.deployContract("LifecycleModule", [
      await roles.getAddress(),
      await passports.getAddress(),
      await lots.getAddress(),
    ]);
    const nextAddress = await nextModule.getAddress();
    const oldAddress = await lifecycle.getAddress();

    for (const role of [
      await roles.PASSPORT_MINTER_ROLE(),
      await roles.PASSPORT_CONTROLLER_ROLE(),
      await roles.LOT_MINTER_ROLE(),
      await roles.LOT_BURNER_ROLE(),
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
