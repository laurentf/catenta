import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      // Pinned, not caret: the compiler version is part of the deployed
      // artifact for a non-upgradeable registry (see docs/CONVENTIONS.md).
      // 0.8.34 also unlocks transient storage (EIP-1153), required by
      // OpenZeppelin's ReentrancyGuardTransient.
      //
      // The optimizer is on in BOTH profiles, and that is not a preference.
      // Since the LifecycleModule carries the orders and the requests, it
      // compiles to ~27 kB unoptimized — past the 24 576-byte EIP-170 limit,
      // which the in-memory test network enforces exactly like Sepolia does.
      // An unoptimized profile would therefore be a profile in which the main
      // contract cannot be deployed at all, tests included. Optimized it sits
      // at ~18 kB, with room to spare.
      default: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: "0.8.34",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
    },
  },
});
