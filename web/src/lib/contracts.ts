import { Contract, id, type ContractRunner } from 'ethers'

/**
 * ABIs *human-readable*, tenues en phase avec contracts/.
 * Les fragments `error` sont inclus : sans eux ethers ne sait pas décoder un
 * revert en erreur nommée, et l'utilisateur voit « unknown custom error ».
 */

export const ROLES_ABI = [
  // rôles acteurs
  'function MANUFACTURER_ROLE() view returns (bytes32)',
  'function LAB_ROLE() view returns (bytes32)',
  'function PRACTITIONER_ROLE() view returns (bytes32)',
  'function DISTRIBUTOR_ROLE() view returns (bytes32)',
  'function REGULATOR_ROLE() view returns (bytes32)',
  'function REGISTRAR_ROLE() view returns (bytes32)',
  'function DEFAULT_ADMIN_ROLE() view returns (bytes32)',
  // rôles modules (accordés à des contrats, jamais à des personnes)
  'function PASSPORT_MINTER_ROLE() view returns (bytes32)',
  'function PASSPORT_CONTROLLER_ROLE() view returns (bytes32)',
  'function LOT_MINTER_ROLE() view returns (bytes32)',
  'function LOT_BURNER_ROLE() view returns (bytes32)',
  'function LOT_CUSTODIAN_ROLE() view returns (bytes32)',
  // lectures
  'function hasRole(bytes32 role, address account) view returns (bool)',
  'function getRoleMemberCount(bytes32 role) view returns (uint256)',
  'function getRoleMember(bytes32 role, uint256 index) view returns (address)',
  // écritures
  'function grantRole(bytes32 role, address account)',
  'function revokeRole(bytes32 role, address account)',
  // events
  'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
  'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
  // erreurs
  'error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)',
  'error AccessControlBadConfirmation()',
] as const

export const PASSPORT_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function balanceOf(address owner) view returns (uint256)',
  'function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function tokenByIndex(uint256 index) view returns (uint256)',
  'function mintedCount() view returns (uint256)',
  'function traitsOf(uint256 tokenId) view returns (tuple(uint64 lotId, uint40 mintedAt, uint128 quantity, bytes32 conformityHash))',
  'function pendingHandoff(uint256 tokenId) view returns (address)',
  'function ROLES() view returns (address)',
  // events
  'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  'event PassportIssued(uint256 indexed tokenId, address indexed lab, uint64 indexed lotId, bytes32 conformityHash)',
  'event HandoffArmed(uint256 indexed tokenId, address indexed from, address indexed to)',
  // erreurs
  'error Soulbound(uint256 tokenId)',
  'error UnauthorizedRole(bytes32 role, address account)',
  'error ERC721NonexistentToken(uint256 tokenId)',
] as const

export const ACTOR_REGISTRY_ABI = [
  'function actorOf(address account) view returns (tuple(string label, string siren))',
  // écritures — agent d'agrément
  'function setLabel(address _account, string _label, string _siren)',
  'function clearLabel(address _account)',
  // events
  'event ActorLabelled(address indexed account, string label, string siren)',
  'event ActorLabelCleared(address indexed account)',
  // erreurs
  'error InvalidLabel()',
  'error InvalidSiren()',
  'error ManufacturerNotLabelled(address account)',
  'error UnauthorizedRole(bytes32 role, address account)',
] as const

export const LOTS_ABI = [
  'function lotOf(uint64 lotId) view returns (tuple(address manufacturer, uint40 declaredAt, bytes32 certHash, string material, string unit))',
  'function lotExists(uint64 lotId) view returns (bool)',
  'function lotCount() view returns (uint64)',
  'function totalSupply(uint256 lotId) view returns (uint256)',
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  // events
  'event LotDeclared(uint64 indexed lotId, address indexed manufacturer, string material, string unit, bytes32 certHash, uint256 quantity)',
  'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  // erreurs
  'error LotNotTransferable()',
  'error UnknownLot(uint64 lotId)',
  'error UnauthorizedRole(bytes32 role, address account)',
  'error ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId)',
] as const

export const CREDIT_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function balanceOf(address account) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  // écriture — admin (CREDIT_MINTER_ROLE) : la seule façon de créditer
  'function mintCredits(address _to, uint256 _amount)',
  // events
  'event CreditsMinted(address indexed account, uint256 amount)',
  'event CreditsSpent(address indexed account, uint256 amount)',
  // erreurs
  'error CreditsNotTransferable()',
  'error InsufficientCredits(address account, uint256 balance, uint256 needed)',
  'error UnauthorizedRole(bytes32 role, address account)',
] as const

export const LIFECYCLE_ABI = [
  // pile
  'function ROLES() view returns (address)',
  'function PASSPORTS() view returns (address)',
  'function LOTS() view returns (address)',
  'function CREDIT() view returns (address)',
  'function actionCost() view returns (uint256)',
  // lectures
  'function statusOf(uint256 tokenId) view returns (uint8)',
  'function patientCommitmentOf(uint256 tokenId) view returns (bytes32)',
  'function placementOf(uint256 tokenId) view returns (tuple(address practitioner, uint40 placedAt, uint8 tooth))',
  'function shipmentCount() view returns (uint256)',
  'function materialOrderCount() view returns (uint256)',
  'function materialOrderOf(uint256 orderId) view returns (tuple(address buyer, uint8 status, address supplier, uint256 quantity, string material, uint256 parentOrderId, uint256 shipmentId, string reason))',
  'function prosthesisRequestCount() view returns (uint256)',
  'function prosthesisRequestOf(uint256 requestId) view returns (tuple(address practitioner, uint8 status, address lab, uint8 tooth, uint256 tokenId, string material, string shade, string description, string reason))',
  'function shipmentOf(uint256 shipmentId) view returns (tuple(address from, uint8 status, address to, uint64 lotId, uint256 quantity))',
  // écritures — fabricant
  'function declareLot(string _material, string _unit, bytes32 _certHash, uint256 _quantity) returns (uint64)',
  // écritures — circulation de la matière (2 temps)
  'function declareShipment(uint64 _lotId, uint256 _quantity, address _to) returns (uint256)',
  'function acceptShipment(uint256 _shipmentId)',
  'function cancelShipment(uint256 _shipmentId)',
  // écritures — commandes de matière
  'function placeMaterialOrder(address _supplier, string _material, uint256 _quantity) returns (uint256)',
  'function escalateMaterialOrder(uint256 _parentOrderId, address _supplier, uint256 _quantity) returns (uint256)',
  'function fulfilMaterialOrder(uint256 _orderId, uint64 _lotId) returns (uint256)',
  'function refuseMaterialOrder(uint256 _orderId, string _reason)',
  'function cancelMaterialOrder(uint256 _orderId, string _reason)',
  // écritures — prescription de prothèse
  'function requestProsthesis(address _lab, string _material, uint8 _tooth, string _shade, string _description) returns (uint256)',
  'function acceptProsthesisRequest(uint256 _requestId)',
  'function refuseProsthesisRequest(uint256 _requestId, string _reason)',
  'function cancelProsthesisRequest(uint256 _requestId, string _reason)',
  // écritures — laboratoire
  'function mintPassport(uint256 _requestId, uint64 _lotId, uint256 _quantity, bytes32 _conformityHash) returns (uint256)',
  // écritures — praticien
  'function attestConformity(uint256 _tokenId)',
  'function markPlaced(uint256 _tokenId, uint8 _tooth, bytes32 _patientCommitment)',
  // écritures — handoff
  'function initiateHandoff(uint256 _tokenId, address _to)',
  'function acceptHandoff(uint256 _tokenId)',
  // écritures — admin
  'function setActionCost(uint256 _cost)',
  // events
  'event MaterialConsumed(uint256 indexed tokenId, uint64 indexed lotId, uint256 quantity)',
  'event ConformityAttested(uint256 indexed tokenId, address indexed practitioner)',
  'event PlacedInMouth(uint256 indexed tokenId, address indexed practitioner, uint8 tooth, bytes32 patientCommitment)',
  'event ShipmentDeclared(uint256 indexed shipmentId, uint64 indexed lotId, address indexed from, address to, uint256 quantity)',
  'event ShipmentAccepted(uint256 indexed shipmentId, uint64 indexed lotId, address indexed to)',
  'event ShipmentCancelled(uint256 indexed shipmentId, uint64 indexed lotId, address indexed from)',
  // erreurs
  'error WrongStatus(uint256 tokenId, uint8 expected, uint8 current)',
  'error UnknownLot(uint64 lotId)',
  'error InsufficientMaterial(address holder, uint64 lotId, uint256 needed)',
  'error SelfShipment()',
  'error NotShipmentRecipient(uint256 shipmentId, address caller)',
  'error NotShipmentSender(uint256 shipmentId, address caller)',
  'error ShipmentSettled(uint256 shipmentId)',
  'error SupplierNotEligible(address supplier)',
  'error NotOrderSupplier(uint256 orderId, address caller)',
  'error NotOrderBuyer(uint256 orderId, address caller)',
  'error OrderSettled(uint256 orderId)',
  'error MaterialMismatch(uint256 orderId, string ordered, string offered)',
  'error NotRequestLab(uint256 requestId, address caller)',
  'error NotRequestPractitioner(uint256 requestId, address caller)',
  'error WrongRequestStatus(uint256 requestId, uint8 expected, uint8 current)',
  'error InvalidText()',
  'error ActionCostTooHigh(uint256 requested, uint256 maximum)',
  'error ZeroQuantity()',
  'error EmptyHash()',
  'error InvalidTooth(uint8 tooth)',
  'error QuantityTooLarge(uint256 quantity)',
  'error NotPassportHolder(uint256 tokenId, address caller)',
  'error RecipientNotEligible(address to)',
  'error SelfHandoff()',
  'error NotPendingRecipient(uint256 tokenId, address caller)',
  'error PassportLocked(uint256 tokenId)',
  'error InsufficientCredits(address account, uint256 balance, uint256 needed)',
  'error UnauthorizedRole(bytes32 role, address account)',
] as const

/** Miroir de LifecycleModule.ShipmentStatus. */
/** Miroir de LifecycleModule.OrderStatus. */
export enum OrderStatus {
  Pending = 0,
  Fulfilled = 1,
  Refused = 2,
  Cancelled = 3,
}

/** Miroir de LifecycleModule.RequestStatus. */
export enum RequestStatus {
  Pending = 0,
  Accepted = 1,
  Fulfilled = 2,
  Refused = 3,
  Cancelled = 4,
}

export enum ShipmentStatus {
  Pending = 0,
  Accepted = 1,
  Cancelled = 2,
}

/** Miroir de LifecycleModule.Status. */
export enum Status {
  Manufactured = 0,
  Certified = 1,
  Placed = 2,
}

/**
 * Rôles, précalculés côté client.
 * keccak256 du nom — identique à ce que le contrat calcule en `constant`, donc
 * pas besoin d'un aller-retour RPC par rôle au démarrage.
 */
export const ROLE = {
  ADMIN: '0x' + '0'.repeat(64),
  MANUFACTURER: id('MANUFACTURER_ROLE'),
  LAB: id('LAB_ROLE'),
  PRACTITIONER: id('PRACTITIONER_ROLE'),
  DISTRIBUTOR: id('DISTRIBUTOR_ROLE'),
  REGULATOR: id('REGULATOR_ROLE'),
  REGISTRAR: id('REGISTRAR_ROLE'),
  PASSPORT_MINTER: id('PASSPORT_MINTER_ROLE'),
  PASSPORT_CONTROLLER: id('PASSPORT_CONTROLLER_ROLE'),
  LOT_MINTER: id('LOT_MINTER_ROLE'),
  LOT_BURNER: id('LOT_BURNER_ROLE'),
  LOT_CUSTODIAN: id('LOT_CUSTODIAN_ROLE'),
  CREDIT_MINTER: id('CREDIT_MINTER_ROLE'),
  CREDIT_SPENDER: id('CREDIT_SPENDER_ROLE'),
} as const

export type RoleKey = keyof typeof ROLE

/** Rôles d'acteurs agréables par un registrar (ou l'admin). */
export const ONBOARDABLE_ROLES: RoleKey[] = [
  'MANUFACTURER',
  'DISTRIBUTOR',
  'LAB',
  'PRACTITIONER',
]
/** Rôles opérationnels sensibles, gérés par la seule racine (DEFAULT_ADMIN) —
 *  y compris l'émission de crédits, qui est un acte humain (le pont
 *  abonnement → crédits est hors chaîne), pas un rôle réservé aux contrats. */
export const ROOT_MANAGED_ROLES: RoleKey[] = ['REGISTRAR', 'REGULATOR', 'CREDIT_MINTER']
/** Tous les rôles humains affichés dans /admin, dans l'ordre de la chaîne. */
export const ACTOR_ROLES: RoleKey[] = [
  'MANUFACTURER',
  'DISTRIBUTOR',
  'LAB',
  'PRACTITIONER',
  'REGULATOR',
  'REGISTRAR',
]
/** Les rôles accordés à des contrats — affichés en lecture seule. */
export const MODULE_ROLES: RoleKey[] = [
  'PASSPORT_MINTER',
  'PASSPORT_CONTROLLER',
  'LOT_MINTER',
  'LOT_BURNER',
  'LOT_CUSTODIAN',
  'CREDIT_SPENDER',
]

export function roles(address: string, runner: ContractRunner): Contract {
  return new Contract(address, ROLES_ABI, runner)
}
export function passports(address: string, runner: ContractRunner): Contract {
  return new Contract(address, PASSPORT_ABI, runner)
}
export function actorRegistry(address: string, runner: ContractRunner): Contract {
  return new Contract(address, ACTOR_REGISTRY_ABI, runner)
}
export function lots(address: string, runner: ContractRunner): Contract {
  return new Contract(address, LOTS_ABI, runner)
}
export function lifecycle(address: string, runner: ContractRunner): Contract {
  return new Contract(address, LIFECYCLE_ABI, runner)
}
export function credit(address: string, runner: ContractRunner): Contract {
  return new Contract(address, CREDIT_ABI, runner)
}

/** Erreurs custom → clé i18n. */
const ERROR_KEYS: Record<string, string> = {
  WrongStatus: 'errors.wrongStatus',
  UnknownLot: 'errors.unknownLot',
  InsufficientMaterial: 'errors.insufficientMaterial',
  SelfShipment: 'errors.selfShipment',
  NotShipmentRecipient: 'errors.notShipmentRecipient',
  NotShipmentSender: 'errors.notShipmentSender',
  ShipmentSettled: 'errors.shipmentSettled',
  InvalidLabel: 'errors.invalidLabel',
  InvalidSiren: 'errors.invalidSiren',
  ManufacturerNotLabelled: 'errors.manufacturerNotLabelled',
  SupplierNotEligible: 'errors.supplierNotEligible',
  NotOrderSupplier: 'errors.notOrderSupplier',
  NotOrderBuyer: 'errors.notOrderBuyer',
  OrderSettled: 'errors.orderSettled',
  MaterialMismatch: 'errors.materialMismatch',
  NotRequestLab: 'errors.notRequestLab',
  NotRequestPractitioner: 'errors.notRequestPractitioner',
  WrongRequestStatus: 'errors.wrongRequestStatus',
  InvalidText: 'errors.invalidText',
  ActionCostTooHigh: 'errors.actionCostTooHigh',
  ZeroQuantity: 'errors.zeroQuantity',
  EmptyHash: 'errors.emptyHash',
  InvalidTooth: 'errors.invalidTooth',
  QuantityTooLarge: 'errors.quantityTooLarge',
  NotPassportHolder: 'errors.notPassportHolder',
  RecipientNotEligible: 'errors.recipientNotEligible',
  SelfHandoff: 'errors.selfHandoff',
  NotPendingRecipient: 'errors.notPendingRecipient',
  PassportLocked: 'errors.passportLocked',
  UnauthorizedRole: 'errors.unauthorizedRole',
  Soulbound: 'errors.soulbound',
  LotNotTransferable: 'errors.lotNotTransferable',
  AccessControlUnauthorizedAccount: 'errors.accessControl',
  ERC1155InsufficientBalance: 'errors.insufficientMaterial',
  ERC721NonexistentToken: 'errors.unknownPassport',
  InsufficientCredits: 'errors.insufficientCredits',
  CreditsNotTransferable: 'errors.creditsNotTransferable',
}

type EthersLikeError = {
  code?: string
  shortMessage?: string
  message?: string
  reason?: string
  revert?: { name?: string } | null
  info?: { error?: { message?: string } }
}

/**
 * Traduit un revert en clé i18n. Un utilisateur ne doit jamais voir
 * « execution reverted (unknown custom error) » : chaque erreur du contrat a
 * une phrase, et le rejet de signature n'est pas une erreur applicative.
 */
export function parseError(err: unknown): { key: string; raw?: string } {
  const e = err as EthersLikeError

  if (e?.code === 'ACTION_REJECTED') return { key: 'errors.rejected' }
  if (e?.code === 'INSUFFICIENT_FUNDS') return { key: 'errors.insufficientFunds' }

  const name = e?.revert?.name
  if (name && ERROR_KEYS[name]) return { key: ERROR_KEYS[name] }

  // repli : certains RPC ne renvoient pas de `revert` décodé, le nom de
  // l'erreur reste alors dans le message brut.
  const blob = `${e?.shortMessage ?? ''} ${e?.message ?? ''} ${e?.info?.error?.message ?? ''}`
  for (const [errName, key] of Object.entries(ERROR_KEYS)) {
    if (blob.includes(errName)) return { key }
  }

  return { key: 'errors.unknown', raw: e?.shortMessage ?? e?.reason ?? e?.message }
}
