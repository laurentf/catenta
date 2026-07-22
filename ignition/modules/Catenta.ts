import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { id } from "ethers";

/**
 * Déploie la pile Catenta et câble les rôles.
 *
 * Ordre imposé par l'architecture (docs/SPEC.md §4) :
 *   1. l'autorité — CatentaRoles ;
 *   2. les stockages permanents — ils ne connaissent que l'autorité ;
 *   3. le module — il connaît l'autorité et les deux stockages ;
 *   4. les rôles modules, accordés au module pour qu'il puisse écrire.
 *
 * L'étape 4 n'est pas un détail de configuration : sans elle les stockages
 * refusent toute écriture, et c'est voulu. C'est aussi ce qui rend un module
 * remplaçable — révoquer ici, accorder ailleurs, sans toucher aux passeports.
 *
 * Déploiement :
 *   npx hardhat keystore set SEPOLIA_RPC_URL
 *   npx hardhat keystore set SEPOLIA_PRIVATE_KEY
 *   npx hardhat ignition deploy ignition/modules/Catenta.ts --network sepolia
 *
 * Le front n'a besoin QUE de l'adresse de LifecycleModule : il lit ROLES,
 * PASSPORTS et LOTS dessus au démarrage.
 */
export default buildModule("CatentaModule", (m) => {
  // Par défaut le déployeur est l'administrateur. Le surcharger via
  // --parameters pour confier l'administration à un multisig dès l'origine
  // (recommandé : c'est la parade à l'attaque n°13, docs/SPEC.md §10).
  const admin = m.getParameter("admin", m.getAccount(0));

  const roles = m.contract("CatentaRoles", [admin]);
  const passports = m.contract("PassportNFT", [roles]);
  const lots = m.contract("MaterialLots", [roles]);
  const credit = m.contract("CatentaCredit", [roles]);
  const lifecycle = m.contract("LifecycleModule", [roles, passports, lots, credit]);

  // Rôles modules — accordés à un CONTRAT, jamais à une personne.
  const moduleRoles = {
    PASSPORT_MINTER_ROLE: id("PASSPORT_MINTER_ROLE"),
    PASSPORT_CONTROLLER_ROLE: id("PASSPORT_CONTROLLER_ROLE"),
    LOT_MINTER_ROLE: id("LOT_MINTER_ROLE"),
    LOT_BURNER_ROLE: id("LOT_BURNER_ROLE"),
    // le module brûle le crédit d'usage de l'appelant à chaque action
    CREDIT_SPENDER_ROLE: id("CREDIT_SPENDER_ROLE"),
  };

  for (const [name, hash] of Object.entries(moduleRoles)) {
    m.call(roles, "grantRole", [hash, lifecycle], { id: `grant_${name}` });
  }

  // L'admin émet les crédits (contre un abonnement hors chaîne). Rôle donné à
  // l'admin, pas à un contrat — c'est un acte humain tant que le pont
  // fiat → crédit reste manuel.
  m.call(roles, "grantRole", [id("CREDIT_MINTER_ROLE"), admin], {
    id: "grant_CREDIT_MINTER_ROLE_admin",
  });

  return { roles, passports, lots, credit, lifecycle };
});
