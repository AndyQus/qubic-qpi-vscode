import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

// ---------------------------------------------------------------------------
// Smart contract detection — lint/completions/hover should activate only when
// the file itself looks like a QPI contract declaration, not merely because it
// mentions `qpi.h` or `ContractBase` somewhere.
//
// Supported forms include:
//   struct MyContract : public ContractBase
//   struct MyContract : ContractBase
//   class MyContract final : public ContractBase
//   struct MyContract
//       : public ContractBase
//
// Comments and string/char literals are stripped before matching, so quoted or
// commented examples do not accidentally turn linting on.
// ---------------------------------------------------------------------------
const QPI_CONTRACT_DECLARATION_REGEX =
    /\b(?:struct|class)\s+[A-Za-z_]\w*(?:\s+final)?\s*:\s*(?:(?:public|protected|private)\s+)?ContractBase\b/;

// ---------------------------------------------------------------------------
// QPI API definitions — shared by IntelliSense and hover provider
// ---------------------------------------------------------------------------
interface QpiMethod {
    name: string;
    signature: string;
    returns: string;
    description: string;
}

interface ContractDocTag {
    name: string;
    description: string;
}

interface ContractDocMeta {
    contract: string | undefined;
    description: string | undefined;
    author: string | undefined;
    version: string | undefined;
    procedures: ContractDocTag[];
    functions: ContractDocTag[];
    states: ContractDocTag[];
    commentRange: vscode.Range;
}

const QPI_METHODS: QpiMethod[] = [
    {
        name: 'invocator',
        signature: 'qpi.invocator()',
        returns: 'id',
        description: 'Returns the identity (`id`) of the **direct caller** of this contract invocation.',
    },
    {
        name: 'originator',
        signature: 'qpi.originator()',
        returns: 'id',
        description: 'Returns the identity (`id`) of the **originator** of the transaction (the entity that signed it).',
    },
    {
        name: 'transfer',
        signature: 'qpi.transfer(dest: id, amount: sint64)',
        returns: 'sint64',
        description: 'Transfers `amount` QU from this contract to `dest`. Returns the transferred amount on success, or a negative value if the transfer failed (e.g. insufficient balance).',
    },
    {
        name: 'burn',
        signature: 'qpi.burn(amount: sint64, contractIndexBurnedFor: uint32 = 0)',
        returns: 'sint64',
        description: 'Burns `amount` QU permanently — removes them from circulation. Optional `contractIndexBurnedFor` defaults to 0 (this contract). Returns the amount burned or a negative value on error.',
    },
    {
        name: 'K12',
        signature: 'qpi.K12(data: T)',
        returns: 'id',
        description: 'Computes the **Qubic K12 hash** of `data` and returns the result as an `id`.',
    },
    {
        name: 'issueAsset',
        signature: 'qpi.issueAsset(name: uint64, numberOfDecimalPlaces: sint8, numberOfShares: sint64, unitOfMeasurement: uint64)',
        returns: 'sint64',
        description: 'Issues a new asset on the Qubic network. Returns the number of issued shares, or a negative value on failure.',
    },
    {
        name: 'transferShareOwnershipAndPossession',
        signature: 'qpi.transferShareOwnershipAndPossession(assetName: uint64, issuer: id, owner: id, possessor: id, numberOfShares: sint64, newOwnerAndPossessor: id)',
        returns: 'sint64',
        description: 'Transfers ownership and possession of `numberOfShares` asset shares from `owner`/`possessor` to `newOwnerAndPossessor`. Returns the number of transferred shares.',
    },
    {
        name: 'tick',
        signature: 'qpi.tick()',
        returns: 'uint32',
        description: 'Returns the **current tick number** of the Qubic network.',
    },
    {
        name: 'epoch',
        signature: 'qpi.epoch()',
        returns: 'uint16',
        description: 'Returns the **current epoch number** of the Qubic network.',
    },
    {
        name: 'year',
        signature: 'qpi.year()',
        returns: 'uint8',
        description: 'Returns the **current UTC year** offset (e.g. 25 for 2025).',
    },
    {
        name: 'month',
        signature: 'qpi.month()',
        returns: 'uint8',
        description: 'Returns the **current UTC month** (1–12).',
    },
    {
        name: 'day',
        signature: 'qpi.day()',
        returns: 'uint8',
        description: 'Returns the **current UTC day of month** (1–31).',
    },
    {
        name: 'hour',
        signature: 'qpi.hour()',
        returns: 'uint8',
        description: 'Returns the **current UTC hour** (0–23).',
    },
    {
        name: 'minute',
        signature: 'qpi.minute()',
        returns: 'uint8',
        description: 'Returns the **current UTC minute** (0–59).',
    },
    {
        name: 'second',
        signature: 'qpi.second()',
        returns: 'uint8',
        description: 'Returns the **current UTC second** (0–59).',
    },
    {
        name: 'arbitrator',
        signature: 'qpi.arbitrator()',
        returns: 'id',
        description: 'Returns the `id` of the current **arbitrator**.',
    },
    {
        name: 'computor',
        signature: 'qpi.computor(computorIndex: uint16)',
        returns: 'id',
        description: 'Returns the `id` of the computor at the given index (0–675).',
    },
    {
        name: 'dayOfWeek',
        signature: 'qpi.dayOfWeek(year: uint8, month: uint8, day: uint8)',
        returns: 'uint8',
        description: 'Returns the day of week for the given date (0 = Wednesday, 1 = Thursday, ..., 6 = Tuesday).',
    },
    {
        name: 'millisecond',
        signature: 'qpi.millisecond()',
        returns: 'uint16',
        description: 'Returns the **current UTC millisecond** (0–999).',
    },
    {
        name: 'getEntity',
        signature: 'qpi.getEntity(id: id, entity: Entity)',
        returns: 'bit',
        description: 'Fills `entity` with the spectrum entry for the given `id`. Returns `1` if found, `0` otherwise.',
    },
    {
        name: 'numberOfPossessedShares',
        signature: 'qpi.numberOfPossessedShares(assetName: uint64, issuer: id, owner: id, possessor: id, ownershipManagingContractIndex: uint32, possessionManagingContractIndex: uint32)',
        returns: 'sint64',
        description: 'Returns the number of possessed shares matching all specified criteria.',
    },
    {
        name: 'numberOfShares',
        signature: 'qpi.numberOfShares(assetName: uint64, issuer: id)',
        returns: 'sint64',
        description: 'Returns the total number of issued shares for the given asset.',
    },
    {
        name: 'isAssetIssued',
        signature: 'qpi.isAssetIssued(issuer: id, assetName: uint64)',
        returns: 'bit',
        description: 'Returns `1` if the asset has been issued by the given issuer, `0` otherwise.',
    },
    {
        name: 'isContractId',
        signature: 'qpi.isContractId(id: id)',
        returns: 'bit',
        description: 'Returns `1` if the given `id` belongs to a smart contract.',
    },
    {
        name: 'nextId',
        signature: 'qpi.nextId(currentId: id)',
        returns: 'id',
        description: 'Returns the next `id` in the spectrum after `currentId`.',
    },
    {
        name: 'prevId',
        signature: 'qpi.prevId(currentId: id)',
        returns: 'id',
        description: 'Returns the previous `id` in the spectrum before `currentId`.',
    },
    {
        name: 'ipoBidId',
        signature: 'qpi.ipoBidId(ipoContractIndex: uint32, ipoBidIndex: uint32)',
        returns: 'id',
        description: 'Returns the `id` of the bidder at the given IPO bid index.',
    },
    {
        name: 'ipoBidPrice',
        signature: 'qpi.ipoBidPrice(ipoContractIndex: uint32, ipoBidIndex: uint32)',
        returns: 'sint64',
        description: 'Returns the bid price at the given IPO bid index.',
    },
    {
        name: 'invocationReward',
        signature: 'qpi.invocationReward()',
        returns: 'sint64',
        description: 'Returns the amount of QU sent with the current invocation.',
    },
    {
        name: 'numberOfTickTransactions',
        signature: 'qpi.numberOfTickTransactions()',
        returns: 'sint32',
        description: 'Returns the number of transactions in the current tick.',
    },
    {
        name: 'now',
        signature: 'qpi.now()',
        returns: 'DateAndTime',
        description: 'Returns the current date and time as a `DateAndTime` struct.',
    },
    {
        name: 'getPrevSpectrumDigest',
        signature: 'qpi.getPrevSpectrumDigest()',
        returns: 'm256i',
        description: 'Returns the spectrum digest of the previous tick.',
    },
    {
        name: 'getPrevUniverseDigest',
        signature: 'qpi.getPrevUniverseDigest()',
        returns: 'm256i',
        description: 'Returns the universe digest of the previous tick.',
    },
    {
        name: 'getPrevComputerDigest',
        signature: 'qpi.getPrevComputerDigest()',
        returns: 'm256i',
        description: 'Returns the computer digest of the previous tick.',
    },
    {
        name: 'signatureValidity',
        signature: 'qpi.signatureValidity(entity: id, digest: id, signature: Array<sint8, 64>)',
        returns: 'bit',
        description: 'Returns `1` if the signature is valid for the given entity and digest.',
    },
    {
        name: 'queryFeeReserve',
        signature: 'qpi.queryFeeReserve(contractIndex: uint32)',
        returns: 'sint64',
        description: 'Returns the fee reserve of the contract at `contractIndex` (0 = this contract).',
    },
    {
        name: 'acquireShares',
        signature: 'qpi.acquireShares(assetName: uint64, issuer: id, owner: id, possessor: id, numberOfShares: sint64, acquirerContractIndex: uint32)',
        returns: 'sint64',
        description: 'Acquires shares into the contract. Returns the number of shares acquired, or a negative value on error.',
    },
    {
        name: 'releaseShares',
        signature: 'qpi.releaseShares(assetName: uint64, issuer: id, owner: id, possessor: id, numberOfShares: sint64, releaserContractIndex: uint32)',
        returns: 'sint64',
        description: 'Releases shares from the contract. Returns the number of shares released, or a negative value on error.',
    },
    {
        name: 'distributeDividends',
        signature: 'qpi.distributeDividends(amountPerShare: sint64)',
        returns: 'bit',
        description: 'Distributes `amountPerShare` QU to every shareholder of this contract. Returns `1` on success.',
    },
    {
        name: 'bidInIPO',
        signature: 'qpi.bidInIPO(ipoContractIndex: uint32, price: sint64, quantity: uint32)',
        returns: 'sint64',
        description: 'Places an IPO bid. Returns the bid index or a negative value on error.',
    },
    {
        name: 'computeMiningFunction',
        signature: 'qpi.computeMiningFunction(miningSeed: id, publicKey: id, nonce: id)',
        returns: 'id',
        description: 'Runs the Qubic mining score function and returns the first 256 bits of the output.',
    },
    {
        name: 'setShareholderProposal',
        signature: 'qpi.setShareholderProposal(contractIndex: uint16, proposalDataBuffer: Array<uint8, 1024>, invocationReward: sint64)',
        returns: 'uint16',
        description: 'Invokes `SET_SHAREHOLDER_PROPOSAL` of `contractIndex`. Returns the proposal index, or `INVALID_PROPOSAL_INDEX` on error.\n\nNote: does **not** check shareholder status or the proposal data buffer.',
    },
    {
        name: 'setShareholderVotes',
        signature: 'qpi.setShareholderVotes(contractIndex: uint16, shareholderVoteData: ProposalMultiVoteDataV1, invocationReward: sint64)',
        returns: 'bit',
        description: 'Invokes `SET_SHAREHOLDER_VOTES` of `contractIndex`. Returns whether the call succeeded.\n\nNote: does **not** check shareholder status or the vote data.',
    },
    {
        name: 'getOracleQuery',
        signature: 'qpi.getOracleQuery<OracleInterface>(queryId: sint64, query: OracleInterface::OracleQuery&)',
        returns: 'bit',
        description: 'Reads an oracle query by `queryId`. Returns whether the id was found and matches the oracle interface; `query` is only written when `true` is returned.',
    },
    {
        name: 'getOracleQueryStatus',
        signature: 'qpi.getOracleQueryStatus(queryId: sint64)',
        returns: 'uint8',
        description: 'Returns the status of an oracle query as one of the `ORACLE_QUERY_STATUS_*` constants (`PENDING`, `COMMITTED`, `SUCCESS`, `UNRESOLVABLE`, `TIMEOUT`, `UNKNOWN`).',
    },
    {
        name: 'getOracleReply',
        signature: 'qpi.getOracleReply<OracleInterface>(queryId: sint64, reply: OracleInterface::OracleReply&)',
        returns: 'bit',
        description: 'Reads an oracle reply by `queryId`. Returns whether the id was found, matches the oracle interface, and a valid reply is available; `reply` is only written when `true` is returned.',
    },
    {
        name: 'unsubscribeOracle',
        signature: 'qpi.unsubscribeOracle(oracleSubscriptionId: sint32)',
        returns: 'bit',
        description: 'Unsubscribes an oracle by subscription id. Returns `false` if `oracleSubscriptionId` is invalid.',
    },
    {
        name: 'getOcInvocationStatus',
        signature: 'qpi.getOcInvocationStatus(invocationId: sint64)',
        returns: 'uint8',
        description: 'Returns the status of an outsourced-computation invocation (from `INVOKE_OC()`) as one of the `OC_INVOCATION_STATUS_*` constants (`PENDING_AUTH`, `AUTHORIZED`, `TIMEOUT`, `UNKNOWN`).',
    },
];

// Lookup map for hover provider
const QPI_METHOD_MAP = new Map<string, QpiMethod>(QPI_METHODS.map((m) => [m.name, m]));

// Documentation for QPI control keywords
const QPI_KEYWORD_DOCS: Record<string, string> = {
    PRIVATE_PROCEDURE:
        '**PRIVATE_PROCEDURE(Name)**\n\nDeclares a procedure callable only from inside this contract (not registered as a user entry point). May modify state.',
    PRIVATE_PROCEDURE_WITH_LOCALS:
        '**PRIVATE_PROCEDURE_WITH_LOCALS(Name)**\n\nLike `PRIVATE_PROCEDURE`, but with a `locals` struct for local variables.',
    PRIVATE_FUNCTION:
        '**PRIVATE_FUNCTION(Name)**\n\nDeclares a read-only function callable only from inside this contract. May NOT modify state.',
    PRIVATE_FUNCTION_WITH_LOCALS:
        '**PRIVATE_FUNCTION_WITH_LOCALS(Name)**\n\nLike `PRIVATE_FUNCTION`, but with a `locals` struct for local variables.',
    BEGIN_EPOCH_WITH_LOCALS:
        '**BEGIN_EPOCH_WITH_LOCALS()**\n\nStart-of-epoch system procedure with a `locals` struct. Must be closed with `END_EPOCH_WITH_LOCALS()`.',
    END_EPOCH_WITH_LOCALS:
        '**END_EPOCH_WITH_LOCALS()**\n\nCloses a `BEGIN_EPOCH_WITH_LOCALS()` block.',
    BEGIN_TICK_WITH_LOCALS:
        '**BEGIN_TICK_WITH_LOCALS()**\n\nPer-tick system procedure with a `locals` struct. Must be closed with `END_TICK_WITH_LOCALS()`.',
    END_TICK_WITH_LOCALS:
        '**END_TICK_WITH_LOCALS()**\n\nCloses a `BEGIN_TICK_WITH_LOCALS()` block.',
    INITIALIZE:
        '**INITIALIZE()**\n\nSystem procedure run once when the contract is constructed. Use it to set up initial state. Closed with `END_INITIALIZE()` style pairing via `INITIALIZE_WITH_LOCALS` when locals are needed.',
    INITIALIZE_WITH_LOCALS:
        '**INITIALIZE_WITH_LOCALS()**\n\nLike `INITIALIZE`, but with a `locals` struct.',
    EXPAND:
        '**EXPAND()**\n\nSystem procedure invoked when the contract state size is increased. Use it to migrate existing data into the larger state layout.',
    MIGRATE:
        '**MIGRATE()**\n\nSystem procedure for migrating contract state to a new state type.',
    MIGRATE_WITH_LOCALS:
        '**MIGRATE_WITH_LOCALS()**\n\nLike `MIGRATE`, but with a `locals` struct.',
    REGISTER_USER_FUNCTION:
        '**REGISTER_USER_FUNCTION(Name, inputType)**\n\nRegisters a single public function as a user-callable entry point. Used inside `REGISTER_USER_FUNCTIONS_AND_PROCEDURES()`.',
    REGISTER_USER_PROCEDURE:
        '**REGISTER_USER_PROCEDURE(Name, inputType)**\n\nRegisters a single public procedure as a user-callable entry point. Used inside `REGISTER_USER_FUNCTIONS_AND_PROCEDURES()`.',
    CALL:
        '**CALL(Name, input, output)**\n\nCalls another function or procedure within the same contract.',
    CALL_OTHER_CONTRACT_FUNCTION:
        '**CALL_OTHER_CONTRACT_FUNCTION(Contract, Name, input, output)**\n\nCalls a public function of another contract (read-only). Nested call depth is limited (currently 10).',
    INVOKE_OTHER_CONTRACT_PROCEDURE:
        '**INVOKE_OTHER_CONTRACT_PROCEDURE(Contract, Name, input, output, invocationReward)**\n\nInvokes a public procedure of another contract, optionally transferring an invocation reward.',
    SELF:
        '**SELF**\n\nThe `id` of this contract.',
    SELF_INDEX:
        '**SELF_INDEX**\n\nThe contract index of this contract.',
    SUBSCRIBE_ORACLE:
        '**SUBSCRIBE_ORACLE(...)**\n\nSubscribes the contract to an oracle interface. Returns a subscription id usable with `qpi.unsubscribeOracle()`.',
    QUERY_ORACLE:
        '**QUERY_ORACLE(...)**\n\nIssues an oracle query. Use `qpi.getOracleQueryStatus()` and `qpi.getOracleReply()` to retrieve the result later.',
    INVOKE_OC:
        '**INVOKE_OC(...)**\n\nInvokes an outsourced computation. Returns an invocation id; check progress with `qpi.getOcInvocationStatus()`.',
    LOG_INFO:
        '**LOG_INFO(message)**\n\nEmits an informational contract log entry.',
    LOG_DEBUG:
        '**LOG_DEBUG(message)**\n\nEmits a debug-level contract log entry.',
    LOG_WARNING:
        '**LOG_WARNING(message)**\n\nEmits a warning-level contract log entry.',
    LOG_ERROR:
        '**LOG_ERROR(message)**\n\nEmits an error-level contract log entry.',
    POST_INCOMING_TRANSFER:
        '**POST_INCOMING_TRANSFER()**\n\nSystem procedure invoked after QU have been transferred into this contract.',
    PRE_ACQUIRE_SHARES:
        '**PRE_ACQUIRE_SHARES()**\n\nSystem procedure invoked before shares managed by this contract are acquired. Used to accept or reject the transfer.',
    POST_ACQUIRE_SHARES:
        '**POST_ACQUIRE_SHARES()**\n\nSystem procedure invoked after shares managed by this contract have been acquired.',
    PRE_RELEASE_SHARES:
        '**PRE_RELEASE_SHARES()**\n\nSystem procedure invoked before shares managed by this contract are released.',
    POST_RELEASE_SHARES:
        '**POST_RELEASE_SHARES()**\n\nSystem procedure invoked after shares managed by this contract have been released.',
    PUBLIC_PROCEDURE:
        '**PUBLIC_PROCEDURE(Name)**\n\nDeclares a public procedure that can be called by external users. Procedures may modify contract state.\n\nUsage:\n```cpp\nPUBLIC_PROCEDURE(MyProc)\n{\n    // body\n}\n```',
    PUBLIC_FUNCTION:
        '**PUBLIC_FUNCTION(Name)**\n\nDeclares a read-only public function. Functions may NOT modify contract state.\n\nUsage:\n```cpp\nPUBLIC_FUNCTION(MyFunc)\n{\n    // body\n}\n```',
    PUBLIC_PROCEDURE_WITH_LOCALS:
        '**PUBLIC_PROCEDURE_WITH_LOCALS(Name)**\n\nSame as `PUBLIC_PROCEDURE` but allows declaring local variables in a `locals` block.',
    PUBLIC_FUNCTION_WITH_LOCALS:
        '**PUBLIC_FUNCTION_WITH_LOCALS(Name)**\n\nSame as `PUBLIC_FUNCTION` but allows declaring local variables in a `locals` block.',
    BEGIN_EPOCH:
        '**BEGIN_EPOCH**\n\nHook executed once at the **start of each epoch**. Use for epoch-level initialisation or settlement logic.',
    END_EPOCH:
        '**END_EPOCH**\n\nMarks the end of the `BEGIN_EPOCH` block. Must always follow `BEGIN_EPOCH`.',
    BEGIN_TICK:
        '**BEGIN_TICK**\n\nHook executed once **every tick**. Use for recurring per-tick logic.',
    END_TICK:
        '**END_TICK**\n\nMarks the end of the `BEGIN_TICK` block. Must always follow `BEGIN_TICK`.',
    REGISTER_USER_FUNCTIONS_AND_PROCEDURES:
        '**REGISTER_USER_FUNCTIONS_AND_PROCEDURES**\n\nRegistration block where all public procedures and functions must be registered using `REGISTER_USER_PROCEDURE` and `REGISTER_USER_FUNCTION` macros.',
};

// ---------------------------------------------------------------------------
// QPI type completions — shown when typing type names
// ---------------------------------------------------------------------------
interface QpiType {
    name: string;
    description: string;
}

const QPI_TYPES: QpiType[] = [
    // Core container types
    { name: 'Array<T, L>', description: 'Fixed-size array of type T with L elements. Use instead of C++ arrays.' },
    { name: 'HashMap<K, V, L>', description: 'Hash map with key type K, value type V, capacity L.' },
    { name: 'HashSet<K, L>', description: 'Hash set with key type K, capacity L.' },
    { name: 'Collection<T, L>', description: 'Ordered collection of type T with capacity L.' },
    { name: 'LinkedList<T, L>', description: 'Doubly-linked list of type T with fixed capacity L (L must be a power of two). O(1) insert at head/tail, insert before/after an index, and removal by index; removed nodes are recycled immediately. Forbidden in the public interface of a contract.' },
    { name: 'SlowAnySizeArray<T, L>', description: 'Array of L elements of type T allowing any capacity L (not only powers of two), at the cost of slower access. Use only when a specific non-power-of-two L is genuinely needed, e.g. in input/output structs.' },
    { name: 'ContractState<T, N>', description: 'Persistent contract state storage.' },

    // Struct types
    { name: 'Entity', description: 'Spectrum entry: contains `id publicKey`, `sint64 incomingAmount, outgoingAmount, numberOfIncomingTransfers, numberOfOutgoingTransfers, latestIncomingTransferTick, latestOutgoingTransferTick`.' },
    { name: 'Asset', description: 'Asset descriptor with `issuer: id`, `assetName: uint64`.' },
    { name: 'DateAndTime', description: 'Date/time struct: `year: uint8, month: uint8, day: uint8, hour: uint8, minute: uint8, second: uint8, millisecond: uint16`.' },
    { name: 'NoData', description: 'Empty struct for procedures/functions with no input or output.' },

    // Integer types
    { name: 'sint8', description: 'Signed 8-bit integer.' },
    { name: 'sint16', description: 'Signed 16-bit integer.' },
    { name: 'sint32', description: 'Signed 32-bit integer.' },
    { name: 'sint64', description: 'Signed 64-bit integer.' },
    { name: 'uint8', description: 'Unsigned 8-bit integer.' },
    { name: 'uint16', description: 'Unsigned 16-bit integer.' },
    { name: 'uint32', description: 'Unsigned 32-bit integer.' },
    { name: 'uint64', description: 'Unsigned 64-bit integer.' },
    { name: 'uint128', description: '128-bit unsigned integer.' },
    { name: 'id', description: 'A 256-bit Qubic identity (public key).' },
    { name: 'bit', description: 'Single bit (0 or 1), used as boolean return type.' },
    { name: 'm256i', description: '256-bit value, used for digests and hashes.' },

    // Iterator types
    { name: 'AssetIssuanceIterator', description: 'Iterates over all issued assets.' },
    { name: 'AssetOwnershipIterator', description: 'Iterates over asset ownership records.' },
    { name: 'AssetPossessionIterator', description: 'Iterates over asset possession records.' },

    // Array typedefs — bit
    { name: 'bit_2', description: 'Array of 2 bit values.' },
    { name: 'bit_4', description: 'Array of 4 bit values.' },
    { name: 'bit_8', description: 'Array of 8 bit values.' },
    { name: 'bit_16', description: 'Array of 16 bit values.' },
    { name: 'bit_32', description: 'Array of 32 bit values.' },
    { name: 'bit_64', description: 'Array of 64 bit values.' },
    { name: 'bit_128', description: 'Array of 128 bit values.' },
    { name: 'bit_256', description: 'Array of 256 bit values.' },
    { name: 'bit_512', description: 'Array of 512 bit values.' },
    { name: 'bit_1024', description: 'Array of 1024 bit values.' },
    { name: 'bit_2048', description: 'Array of 2048 bit values.' },
    { name: 'bit_4096', description: 'Array of 4096 bit values.' },

    // Array typedefs — sint8
    { name: 'sint8_2', description: 'Array of 2 sint8 values.' },
    { name: 'sint8_4', description: 'Array of 4 sint8 values.' },
    { name: 'sint8_8', description: 'Array of 8 sint8 values.' },
    // Array typedefs — sint16
    { name: 'sint16_2', description: 'Array of 2 sint16 values.' },
    { name: 'sint16_4', description: 'Array of 4 sint16 values.' },
    { name: 'sint16_8', description: 'Array of 8 sint16 values.' },
    // Array typedefs — sint32
    { name: 'sint32_2', description: 'Array of 2 sint32 values.' },
    { name: 'sint32_4', description: 'Array of 4 sint32 values.' },
    { name: 'sint32_8', description: 'Array of 8 sint32 values.' },
    // Array typedefs — sint64
    { name: 'sint64_2', description: 'Array of 2 sint64 values.' },
    { name: 'sint64_4', description: 'Array of 4 sint64 values.' },
    { name: 'sint64_8', description: 'Array of 8 sint64 values.' },

    // Array typedefs — uint8
    { name: 'uint8_2', description: 'Array of 2 uint8 values.' },
    { name: 'uint8_4', description: 'Array of 4 uint8 values.' },
    { name: 'uint8_8', description: 'Array of 8 uint8 values.' },
    // Array typedefs — uint16
    { name: 'uint16_2', description: 'Array of 2 uint16 values.' },
    { name: 'uint16_4', description: 'Array of 4 uint16 values.' },
    { name: 'uint16_8', description: 'Array of 8 uint16 values.' },
    // Array typedefs — uint32
    { name: 'uint32_2', description: 'Array of 2 uint32 values.' },
    { name: 'uint32_4', description: 'Array of 4 uint32 values.' },
    { name: 'uint32_8', description: 'Array of 8 uint32 values.' },
    // Array typedefs — uint64
    { name: 'uint64_2', description: 'Array of 2 uint64 values.' },
    { name: 'uint64_4', description: 'Array of 4 uint64 values.' },
    { name: 'uint64_8', description: 'Array of 8 uint64 values.' },

    // Array typedefs — id
    { name: 'id_2', description: 'Array of 2 id values.' },
    { name: 'id_4', description: 'Array of 4 id values.' },
    { name: 'id_8', description: 'Array of 8 id values.' },
];

// Lookup map for type hover
const QPI_TYPE_MAP = new Map<string, QpiType>(
    QPI_TYPES.map((t) => [t.name.replace(/<.*>$/, ''), t]),
);

// ---------------------------------------------------------------------------
// QPI constants — shown as constant completions
// ---------------------------------------------------------------------------
interface QpiConstant {
    name: string;
    detail: string;
    description: string;
}

const QPI_CONSTANTS: QpiConstant[] = [
    { name: 'NULL_ID', detail: 'id', description: 'The zero/null id. Equivalent to `id::zero()`.' },
    { name: 'NULL_INDEX', detail: 'sint64 (-1)', description: 'Sentinel value `-1` indicating an invalid or not-found index.' },
    { name: 'INVALID_AMOUNT', detail: 'sint64', description: 'Sentinel value for invalid QU amounts.' },
    { name: 'NUMBER_OF_COMPUTORS', detail: '676', description: 'Total number of computors in the Qubic network.' },
    { name: 'QUORUM', detail: '451', description: 'Minimum number of computors required for consensus.' },
    { name: 'INVALID_PROPOSAL_INDEX', detail: 'uint16', description: 'Sentinel returned by `qpi.setShareholderProposal()` when the proposal could not be set.' },
    { name: 'INVALID_VOTE_INDEX', detail: 'uint32', description: 'Sentinel value indicating an invalid vote index.' },
    { name: 'NO_VOTE_VALUE', detail: 'sint64', description: 'Value representing "no vote cast" in proposal voting.' },
    { name: 'ORACLE_QUERY_STATUS_UNKNOWN', detail: 'uint8', description: 'Oracle query status: the query id is unknown.' },
    { name: 'ORACLE_QUERY_STATUS_PENDING', detail: 'uint8', description: 'Oracle query status: the query is waiting to be answered.' },
    { name: 'ORACLE_QUERY_STATUS_COMMITTED', detail: 'uint8', description: 'Oracle query status: replies have been committed but not yet confirmed.' },
    { name: 'ORACLE_QUERY_STATUS_SUCCESS', detail: 'uint8', description: 'Oracle query status: the reply has been confirmed and is available.' },
    { name: 'ORACLE_QUERY_STATUS_UNRESOLVABLE', detail: 'uint8', description: 'Oracle query status: no valid reply, because computors disagreed about the value.' },
    { name: 'ORACLE_QUERY_STATUS_TIMEOUT', detail: 'uint8', description: 'Oracle query status: no valid reply available and the timeout has hit.' },
    { name: 'OC_INVOCATION_STATUS_UNKNOWN', detail: 'uint8', description: 'Outsourced-computation status: the invocation id is unknown.' },
    { name: 'OC_INVOCATION_STATUS_PENDING_AUTH', detail: 'uint8', description: 'Outsourced-computation status: recorded, waiting for QUORUM authorization signatures.' },
    { name: 'OC_INVOCATION_STATUS_AUTHORIZED', detail: 'uint8', description: 'Outsourced-computation status: QUORUM signatures counted, bundle eligible for delivery.' },
    { name: 'OC_INVOCATION_STATUS_TIMEOUT', detail: 'uint8', description: 'Outsourced-computation status: authorization did not reach quorum before the timeout.' },

    // Letter constants for the ID() macro
    { name: '_A', detail: 'letter constant', description: 'Letter constant `A` used with the `ID()` macro to construct ids.' },
    { name: '_B', detail: 'letter constant', description: 'Letter constant `B` used with the `ID()` macro to construct ids.' },
    { name: '_C', detail: 'letter constant', description: 'Letter constant `C` used with the `ID()` macro to construct ids.' },
    { name: '_D', detail: 'letter constant', description: 'Letter constant `D` used with the `ID()` macro to construct ids.' },
    { name: '_E', detail: 'letter constant', description: 'Letter constant `E` used with the `ID()` macro to construct ids.' },
    { name: '_F', detail: 'letter constant', description: 'Letter constant `F` used with the `ID()` macro to construct ids.' },
    { name: '_G', detail: 'letter constant', description: 'Letter constant `G` used with the `ID()` macro to construct ids.' },
    { name: '_H', detail: 'letter constant', description: 'Letter constant `H` used with the `ID()` macro to construct ids.' },
    { name: '_I', detail: 'letter constant', description: 'Letter constant `I` used with the `ID()` macro to construct ids.' },
    { name: '_J', detail: 'letter constant', description: 'Letter constant `J` used with the `ID()` macro to construct ids.' },
    { name: '_K', detail: 'letter constant', description: 'Letter constant `K` used with the `ID()` macro to construct ids.' },
    { name: '_L', detail: 'letter constant', description: 'Letter constant `L` used with the `ID()` macro to construct ids.' },
    { name: '_M', detail: 'letter constant', description: 'Letter constant `M` used with the `ID()` macro to construct ids.' },
    { name: '_N', detail: 'letter constant', description: 'Letter constant `N` used with the `ID()` macro to construct ids.' },
    { name: '_O', detail: 'letter constant', description: 'Letter constant `O` used with the `ID()` macro to construct ids.' },
    { name: '_P', detail: 'letter constant', description: 'Letter constant `P` used with the `ID()` macro to construct ids.' },
    { name: '_Q', detail: 'letter constant', description: 'Letter constant `Q` used with the `ID()` macro to construct ids.' },
    { name: '_R', detail: 'letter constant', description: 'Letter constant `R` used with the `ID()` macro to construct ids.' },
    { name: '_S', detail: 'letter constant', description: 'Letter constant `S` used with the `ID()` macro to construct ids.' },
    { name: '_T', detail: 'letter constant', description: 'Letter constant `T` used with the `ID()` macro to construct ids.' },
    { name: '_U', detail: 'letter constant', description: 'Letter constant `U` used with the `ID()` macro to construct ids.' },
    { name: '_V', detail: 'letter constant', description: 'Letter constant `V` used with the `ID()` macro to construct ids.' },
    { name: '_W', detail: 'letter constant', description: 'Letter constant `W` used with the `ID()` macro to construct ids.' },
    { name: '_X', detail: 'letter constant', description: 'Letter constant `X` used with the `ID()` macro to construct ids.' },
    { name: '_Y', detail: 'letter constant', description: 'Letter constant `Y` used with the `ID()` macro to construct ids.' },
    { name: '_Z', detail: 'letter constant', description: 'Letter constant `Z` used with the `ID()` macro to construct ids.' },

    // Month constants
    { name: 'JANUARY', detail: '1', description: 'Month constant for January (1).' },
    { name: 'FEBRUARY', detail: '2', description: 'Month constant for February (2).' },
    { name: 'MARCH', detail: '3', description: 'Month constant for March (3).' },
    { name: 'APRIL', detail: '4', description: 'Month constant for April (4).' },
    { name: 'MAY', detail: '5', description: 'Month constant for May (5).' },
    { name: 'JUNE', detail: '6', description: 'Month constant for June (6).' },
    { name: 'JULY', detail: '7', description: 'Month constant for July (7).' },
    { name: 'AUGUST', detail: '8', description: 'Month constant for August (8).' },
    { name: 'SEPTEMBER', detail: '9', description: 'Month constant for September (9).' },
    { name: 'OCTOBER', detail: '10', description: 'Month constant for October (10).' },
    { name: 'NOVEMBER', detail: '11', description: 'Month constant for November (11).' },
    { name: 'DECEMBER', detail: '12', description: 'Month constant for December (12).' },

    // Day-of-week constants
    { name: 'MONDAY', detail: 'day of week', description: 'Day-of-week constant for Monday.' },
    { name: 'TUESDAY', detail: 'day of week', description: 'Day-of-week constant for Tuesday.' },
    { name: 'WEDNESDAY', detail: 'day of week', description: 'Day-of-week constant for Wednesday.' },
    { name: 'THURSDAY', detail: 'day of week', description: 'Day-of-week constant for Thursday.' },
    { name: 'FRIDAY', detail: 'day of week', description: 'Day-of-week constant for Friday.' },
    { name: 'SATURDAY', detail: 'day of week', description: 'Day-of-week constant for Saturday.' },
    { name: 'SUNDAY', detail: 'day of week', description: 'Day-of-week constant for Sunday.' },
];

// Lookup map for constant hover
const QPI_CONSTANT_MAP = new Map<string, QpiConstant>(QPI_CONSTANTS.map((c) => [c.name, c]));

// ---------------------------------------------------------------------------
// Diagnostic collection (reused across all document updates)
// ---------------------------------------------------------------------------
let diagnosticCollection: vscode.DiagnosticCollection;

// ---------------------------------------------------------------------------
// Contract doc-comment metadata cache (keyed by document URI)
// ---------------------------------------------------------------------------
const docMetaCache = new Map<string, { version: number; meta: ContractDocMeta | undefined }>();

function getContractDocMeta(document: vscode.TextDocument): ContractDocMeta | undefined {
    const key = document.uri.toString();
    const cached = docMetaCache.get(key);
    if (cached && cached.version === document.version) {
        return cached.meta;
    }
    const meta = parseContractDocComment(document.getText(), document);
    docMetaCache.set(key, { version: document.version, meta });
    return meta;
}

// ---------------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------------
export function activate(context: vscode.ExtensionContext): void {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('qubic-qpi');
    context.subscriptions.push(diagnosticCollection);

    // --- Command: create a new empty QPI contract file ---
    const newContractCmd = vscode.commands.registerCommand('qubic.newContract', async () => {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        let name: string | undefined;
        while (true) {
            name = await vscode.window.showInputBox({
                prompt: 'Enter contract name (e.g. MyContract)',
                validateInput: (v) =>
                    /^[A-Za-z][A-Za-z0-9_]*$/.test(v) ? null : 'Use only letters, digits, and underscores',
            });

            if (!name) {
                return;
            }

            const candidateUri = workspaceFolders
                ? vscode.Uri.joinPath(workspaceFolders[0].uri, `${name}.h`)
                : vscode.Uri.file(path.join(os.homedir(), `${name}.h`));

            let exists = false;
            try {
                await vscode.workspace.fs.stat(candidateUri);
                exists = true;
            } catch {
                exists = false;
            }

            if (exists) {
                await vscode.window.showErrorMessage(
                    'A smart contract with the same name already exists, so please specify a different name',
                );
            } else {
                break;
            }
        }

        const targetUri = workspaceFolders
            ? vscode.Uri.joinPath(workspaceFolders[0].uri, `${name}.h`)
            : vscode.Uri.file(path.join(os.homedir(), `${name}.h`));

        const contractTemplate = buildContractTemplate(name);

        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(contractTemplate, 'utf8'));
        const doc = await vscode.workspace.openTextDocument(targetUri);
        await vscode.window.showTextDocument(doc);
    });

    context.subscriptions.push(newContractCmd);

    // --- Lint on open, save, and change ---
    const lintOnOpen = vscode.workspace.onDidOpenTextDocument(lintDocument);
    const lintOnSave = vscode.workspace.onDidSaveTextDocument(lintDocument);
    let lintTimeout: ReturnType<typeof setTimeout> | undefined;
    const lintOnChange = vscode.workspace.onDidChangeTextDocument((e) => {
        if (lintTimeout) {
            clearTimeout(lintTimeout);
        }
        lintTimeout = setTimeout(() => lintDocument(e.document), 300);
    });

    context.subscriptions.push(lintOnOpen, lintOnSave, lintOnChange);

    // Lint all already-open documents at activation time
    vscode.workspace.textDocuments.forEach(lintDocument);

    // --- Phase 2: IntelliSense — qpi.* completion ---
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        [{ language: 'qpi' }, { language: 'cpp' }],
        {
            provideCompletionItems(
                document: vscode.TextDocument,
                position: vscode.Position,
            ): vscode.CompletionItem[] {
                if (!isQpiDocument(document)) {
                    return [];
                }

                const linePrefix = document.lineAt(position).text.slice(0, position.character);
                if (!linePrefix.endsWith('qpi.')) {
                    return [];
                }

                return QPI_METHODS.map((method) => {
                    const item = new vscode.CompletionItem(
                        method.name,
                        vscode.CompletionItemKind.Method,
                    );
                    item.detail = `${method.returns} ${method.signature}`;
                    item.documentation = new vscode.MarkdownString(method.description);
                    item.insertText = buildSnippet(method);
                    return item;
                });
            },
        },
        '.', // trigger on '.'
    );

    context.subscriptions.push(completionProvider);

    // --- IntelliSense — QPI types and constants (general, not qpi.* prefixed) ---
    const typeConstCompletionProvider = vscode.languages.registerCompletionItemProvider(
        [{ language: 'qpi' }, { language: 'cpp' }],
        {
            provideCompletionItems(
                document: vscode.TextDocument,
                _position: vscode.Position,
            ): vscode.CompletionItem[] {
                if (!isQpiDocument(document)) {
                    return [];
                }

                const items: vscode.CompletionItem[] = [];

                for (const t of QPI_TYPES) {
                    const item = new vscode.CompletionItem(
                        t.name,
                        vscode.CompletionItemKind.Keyword,
                    );
                    item.detail = `QPI type — ${t.name}`;
                    item.documentation = new vscode.MarkdownString(t.description);
                    items.push(item);
                }

                for (const c of QPI_CONSTANTS) {
                    const item = new vscode.CompletionItem(
                        c.name,
                        vscode.CompletionItemKind.Constant,
                    );
                    item.detail = c.detail;
                    item.documentation = new vscode.MarkdownString(c.description);
                    items.push(item);
                }

                return items;
            },
        },
    );

    context.subscriptions.push(typeConstCompletionProvider);

    // --- Hover documentation ---
    const hoverProvider = vscode.languages.registerHoverProvider(
        [{ language: 'qpi' }, { language: 'cpp' }],
        {
            provideHover(
                document: vscode.TextDocument,
                position: vscode.Position,
            ): vscode.Hover | undefined {
                if (!isQpiDocument(document)) {
                    return undefined;
                }

                const range = document.getWordRangeAtPosition(position, /qpi\.\w+|\w+/);
                if (!range) {
                    return undefined;
                }

                const word = document.getText(range);

                // qpi.methodName hover
                const qpiMatch = word.match(/^qpi\.(\w+)$/);
                if (qpiMatch) {
                    const method = QPI_METHOD_MAP.get(qpiMatch[1]);
                    if (method) {
                        return buildMethodHover(method);
                    }
                }

                // QPI keyword hover (bare word like PUBLIC_PROCEDURE)
                const keywordDoc = QPI_KEYWORD_DOCS[word];
                if (keywordDoc) {
                    return new vscode.Hover(new vscode.MarkdownString(keywordDoc));
                }

                // QPI type hover
                const typeInfo = QPI_TYPE_MAP.get(word);
                if (typeInfo) {
                    const md = new vscode.MarkdownString();
                    md.appendCodeblock(typeInfo.name, 'cpp');
                    md.appendMarkdown('\n\n' + typeInfo.description);
                    return new vscode.Hover(md);
                }

                // QPI constant hover
                const constInfo = QPI_CONSTANT_MAP.get(word);
                if (constInfo) {
                    const md = new vscode.MarkdownString();
                    md.appendCodeblock(`${constInfo.name}  // ${constInfo.detail}`, 'cpp');
                    md.appendMarkdown('\n\n' + constInfo.description);
                    return new vscode.Hover(md);
                }

                // Contract doc-comment hover — show metadata when hovering over the contract struct name
                if (isQpiDocument(document)) {
                    const meta = getContractDocMeta(document);
                    if (meta && meta.contract && word === meta.contract) {
                        return buildContractDocHover(meta);
                    }
                }

                return undefined;
            },
        },
    );

    context.subscriptions.push(hoverProvider);
}

// ---------------------------------------------------------------------------
// deactivate
// ---------------------------------------------------------------------------
export function deactivate(): void {
    if (diagnosticCollection) {
        diagnosticCollection.clear();
        diagnosticCollection.dispose();
    }
}

// ---------------------------------------------------------------------------
// isQpiDocument — true when the document looks like a QPI contract
// ---------------------------------------------------------------------------
function isQpiDocument(document: vscode.TextDocument): boolean {
    return document.fileName.endsWith('.h') && looksLikeQpiContractText(document.getText());
}

function looksLikeQpiContractText(text: string): boolean {
    const strippedText = stripStrings(stripAllComments(text));
    return QPI_CONTRACT_DECLARATION_REGEX.test(strippedText);
}

// ---------------------------------------------------------------------------
// buildSnippet — creates a SnippetString with tab-stops for method arguments
// ---------------------------------------------------------------------------
function buildSnippet(method: QpiMethod): vscode.SnippetString {
    // Extract parameter names from signature (everything inside the outer parens)
    const parenMatch = method.signature.match(/\(([^)]*)\)/);
    const paramStr = parenMatch ? parenMatch[1].trim() : '';

    if (!paramStr) {
        return new vscode.SnippetString(`${method.name}()`);
    }

    const params = paramStr.split(',').map((p) => p.trim().split(':')[0].trim());
    const tabStops = params.map((p, i) => `\${${i + 1}:${p}}`).join(', ');
    return new vscode.SnippetString(`${method.name}(${tabStops})`);
}

// ---------------------------------------------------------------------------
// buildMethodHover — creates a Hover card for a qpi.* method
// ---------------------------------------------------------------------------
function buildMethodHover(method: QpiMethod): vscode.Hover {
    const md = new vscode.MarkdownString();
    md.appendCodeblock(`${method.returns} ${method.signature}`, 'cpp');
    md.appendMarkdown('\n\n' + method.description);
    return new vscode.Hover(md);
}

// ---------------------------------------------------------------------------
// lintDocument — produce diagnostics for a single document
// ---------------------------------------------------------------------------
function lintDocument(document: vscode.TextDocument): void {
    // Only process .h files that appear to contain QPI content
    if (!document.fileName.endsWith('.h')) {
        return;
    }

    const text = document.getText();

    // Skip files that do not declare a QPI smart contract — not a smart contract
    if (!looksLikeQpiContractText(text)) {
        diagnosticCollection.delete(document.uri);
        return;
    }

    const diagnostics: vscode.Diagnostic[] = [];

    // Strip all comments from the full text for document-level rules.
    // Positions are preserved (content replaced with spaces, newlines kept).
    const strippedText = stripAllComments(text);

    // Collect struct/enum/class/namespace names for scope-operator check
    const definedNames = new Set<string>();
    const defRegex = /\b(?:struct|enum|class|namespace)\s+(\w+)/g;
    let defMatch: RegExpExecArray | null;
    while ((defMatch = defRegex.exec(strippedText)) !== null) {
        definedNames.add(defMatch[1]);
    }

    let inBlockComment = false;
    let braceDepth = 0;

    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
        const lineText = document.lineAt(lineIndex).text;

        // Phase 1: strip comments (preserving string/char literals)
        const { result: commentFree, inBlockComment: nextState } =
            stripComments(lineText, inBlockComment);
        inBlockComment = nextState;

        const stripped = stripStrings(commentFree);
        const braceDepthAtLineStart = braceDepth;

        // ----------------------------------------------------------------
        // QPI001: Preprocessor — #include "qpi.h" / <qpi.h> is Warning (IDE only);
        // any other # line (other includes, #define, etc.) is Error.
        // ----------------------------------------------------------------
        if (/^\s*#/.test(commentFree)) {
            const col = commentFree.indexOf('#');
            const range = new vscode.Range(lineIndex, col, lineIndex, lineText.length);
            if (isQpiHIncludeLine(commentFree)) {
                const diagnostic = new vscode.Diagnostic(
                    range,
                    '#include of qpi.h is allowed only for local IntelliSense while developing; remove this line before deploying the contract.',
                    vscode.DiagnosticSeverity.Warning,
                );
                diagnostic.source = 'qubic-qpi';
                diagnostic.code = 'QPI001';
                diagnostics.push(diagnostic);
            } else {
                const diagnostic = new vscode.Diagnostic(
                    range,
                    'Preprocessor directives (#) are prohibited in deployed QPI contracts. This line is not #include of qpi.h — remove it (other headers, #define, #pragma, conditional compilation, etc. are forbidden).',
                    vscode.DiagnosticSeverity.Error,
                );
                diagnostic.source = 'qubic-qpi';
                diagnostic.code = 'QPI001';
                diagnostics.push(diagnostic);
            }
            braceDepth += countBraceDelta(stripped);
            continue; // no further checks on this line
        }

        // ----------------------------------------------------------------
        // QPI004 / QPI005: string and char literals
        // Checked on comment-free text before strings are stripped.
        // ----------------------------------------------------------------
        checkStringLiteral(commentFree, lineIndex, diagnostics);
        checkCharLiteral(commentFree, lineIndex, diagnostics);

        // ----------------------------------------------------------------
        // Per-line operator and pattern checks (stripped = no string contents)
        // ----------------------------------------------------------------
        checkTypedefUsingScope(stripped, lineIndex, braceDepthAtLineStart, diagnostics);
        checkRawDivision(stripped, lineIndex, diagnostics);
        checkRawModulo(stripped, lineIndex, diagnostics);
        checkArraySubscript(stripped, lineIndex, diagnostics);
        checkEllipsis(stripped, lineIndex, diagnostics);
        checkScopeOperator(stripped, lineIndex, diagnostics, definedNames);
        checkPointerStar(stripped, lineIndex, diagnostics);
        checkDoubleUnderscore(stripped, lineIndex, diagnostics);
        checkProhibitedKeywords(stripped, lineIndex, diagnostics);
        checkNativeIntegerKeywords(stripped, lineIndex, diagnostics);

        braceDepth += countBraceDelta(stripped);
    }

    // ----------------------------------------------------------------
    // Contract-level validation (whole-document rules).
    // Uses strippedText so keywords inside comments are ignored.
    // ----------------------------------------------------------------
    validateContract(document, strippedText, diagnostics);
    checkDocCommentCoverage(document, diagnostics);

    diagnosticCollection.set(document.uri, diagnostics);
}

// ---------------------------------------------------------------------------
// validateContract — whole-document structural checks
// ---------------------------------------------------------------------------
function validateContract(
    document: vscode.TextDocument,
    text: string,
    diagnostics: vscode.Diagnostic[],
): void {
    // ----------------------------------------------------------------
    // Rule 4 (Error): BEGIN_EPOCH without END_EPOCH
    // Rule 5 (Error): BEGIN_TICK without END_TICK
    // ----------------------------------------------------------------
    checkBlockBalance(document, text, 'BEGIN_EPOCH', 'END_EPOCH', 'QPI010', diagnostics);
    checkBlockBalance(document, text, 'BEGIN_TICK', 'END_TICK', 'QPI011', diagnostics);

    // ----------------------------------------------------------------
    // Rule 6 (Warning): PUBLIC_PROCEDURE / PUBLIC_FUNCTION declared but
    // not registered in REGISTER_USER_FUNCTIONS_AND_PROCEDURES
    // ----------------------------------------------------------------
    checkUnregisteredEntrypoints(document, text, diagnostics);

    // ----------------------------------------------------------------
    // Rule 7 (Error): complex container types in the public interface
    // ----------------------------------------------------------------
    checkPublicInterfaceTypes(document, text, diagnostics);
}

// ---------------------------------------------------------------------------
// stripAllComments — removes // and /* */ comments from full document text.
// Preserves string/char literals so they are not misinterpreted as comments.
// Content is replaced with spaces; newlines are kept for positional accuracy.
// ---------------------------------------------------------------------------
function stripAllComments(text: string): string {
    let result = '';
    let i = 0;
    let inBlock = false;

    while (i < text.length) {
        if (inBlock) {
            if (text[i] === '*' && text[i + 1] === '/') {
                result += '  ';
                i += 2;
                inBlock = false;
            } else {
                result += text[i] === '\n' ? '\n' : ' ';
                i++;
            }
            continue;
        }

        // Block comment start
        if (text[i] === '/' && text[i + 1] === '*') {
            result += '  ';
            i += 2;
            inBlock = true;
            continue;
        }

        // Line comment — blank to end of line
        if (text[i] === '/' && text[i + 1] === '/') {
            while (i < text.length && text[i] !== '\n') {
                result += ' ';
                i++;
            }
            continue;
        }

        // Skip over string literals (preserve them)
        if (text[i] === '"') {
            result += text[i];
            i++;
            while (i < text.length && text[i] !== '"' && text[i] !== '\n') {
                if (text[i] === '\\') {
                    result += text[i];
                    i++;
                }
                result += text[i];
                i++;
            }
            if (i < text.length && text[i] === '"') {
                result += text[i];
                i++;
            }
            continue;
        }

        // Skip over char literals (preserve them)
        if (text[i] === "'") {
            result += text[i];
            i++;
            while (i < text.length && text[i] !== "'" && text[i] !== '\n') {
                if (text[i] === '\\') {
                    result += text[i];
                    i++;
                }
                result += text[i];
                i++;
            }
            if (i < text.length && text[i] === "'") {
                result += text[i];
                i++;
            }
            continue;
        }

        result += text[i];
        i++;
    }

    return result;
}

// ---------------------------------------------------------------------------
// stripComments — strips // and /* */ comments from a single line.
// Preserves string/char literals so they can be detected separately.
// Returns the cleaned line and the updated block-comment state.
// ---------------------------------------------------------------------------
function stripComments(
    line: string,
    inBlockComment: boolean,
): { result: string; inBlockComment: boolean } {
    let result = '';
    let i = 0;
    let inBlock = inBlockComment;

    while (i < line.length) {
        // Inside a block comment — scan for closing */
        if (inBlock) {
            if (line[i] === '*' && line[i + 1] === '/') {
                result += '  ';
                i += 2;
                inBlock = false;
            } else {
                result += ' ';
                i++;
            }
            continue;
        }

        // Line comment — blank out the rest of the line
        if (line[i] === '/' && line[i + 1] === '/') {
            result += ' '.repeat(line.length - i);
            break;
        }

        // Block comment start
        if (line[i] === '/' && line[i + 1] === '*') {
            result += '  ';
            i += 2;
            inBlock = true;
            continue;
        }

        // Skip over string literals (preserve them)
        if (line[i] === '"') {
            result += line[i];
            i++;
            while (i < line.length && line[i] !== '"') {
                if (line[i] === '\\') {
                    result += line[i];
                    i++;
                }
                result += line[i];
                i++;
            }
            if (i < line.length) {
                result += line[i]; // closing "
                i++;
            }
            continue;
        }

        // Skip over char literals (preserve them)
        if (line[i] === "'") {
            result += line[i];
            i++;
            while (i < line.length && line[i] !== "'") {
                if (line[i] === '\\') {
                    result += line[i];
                    i++;
                }
                result += line[i];
                i++;
            }
            if (i < line.length) {
                result += line[i]; // closing '
                i++;
            }
            continue;
        }

        result += line[i];
        i++;
    }

    return { result, inBlockComment: inBlock };
}

// ---------------------------------------------------------------------------
// isQpiHIncludeLine — #include "qpi.h" / <qpi.h> (linted as QPI001 Warning, not Error).
// ---------------------------------------------------------------------------
function isQpiHIncludeLine(commentFree: string): boolean {
    const t = commentFree.trim();
    // As of qubic/core v1.302.x the QPI header lives in src/qpi/ (it was src/contracts/qpi.h
    // before), so an optional directory prefix such as "qpi/qpi.h" is accepted too.
    return /^#\s*include\s*["<][\w./-]*qpi\.h[">]/.test(t);
}

// ---------------------------------------------------------------------------
// countBraceDelta — net `{` vs `}` on a line (strings already stripped).
// ---------------------------------------------------------------------------
function countBraceDelta(s: string): number {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '{') {
            n++;
        } else if (s[i] === '}') {
            n--;
        }
    }
    return n;
}

// ---------------------------------------------------------------------------
// braceDepthBeforeIndexInLine — brace nesting depth at a column on this line.
// ---------------------------------------------------------------------------
function braceDepthBeforeIndexInLine(
    stripped: string,
    pos: number,
    braceDepthAtLineStart: number,
): number {
    let d = braceDepthAtLineStart;
    for (let i = 0; i < pos; i++) {
        if (stripped[i] === '{') {
            d++;
        } else if (stripped[i] === '}') {
            d--;
        }
    }
    return d;
}

// ---------------------------------------------------------------------------
// stripStrings — strips "..." and '...' literals from (already comment-free)
// text.  Content is replaced with spaces to preserve column positions.
// ---------------------------------------------------------------------------
function stripStrings(line: string): string {
    let result = '';
    let i = 0;

    while (i < line.length) {
        if (line[i] === '"') {
            const start = i;
            i++;
            while (i < line.length && line[i] !== '"') {
                if (line[i] === '\\') {
                    i++;
                }
                i++;
            }
            i++; // consume closing "
            result += ' '.repeat(i - start);
            continue;
        }

        if (line[i] === "'") {
            const start = i;
            i++;
            while (i < line.length && line[i] !== "'") {
                if (line[i] === '\\') {
                    i++;
                }
                i++;
            }
            i++; // consume closing '
            result += ' '.repeat(i - start);
            continue;
        }

        result += line[i];
        i++;
    }

    return result;
}

// ---------------------------------------------------------------------------
// checkStringLiteral — QPI004 Error
// String literals ("...") are not supported in QPI contracts.
// ---------------------------------------------------------------------------
function checkStringLiteral(
    commentFree: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
): void {
    for (let i = 0; i < commentFree.length; i++) {
        if (commentFree[i] !== '"') {
            continue;
        }
        const start = i;
        i++;
        while (i < commentFree.length && commentFree[i] !== '"') {
            if (commentFree[i] === '\\') {
                i++;
            }
            i++;
        }
        i++; // past closing "
        const range = new vscode.Range(lineIndex, start, lineIndex, Math.min(i, commentFree.length));
        const diagnostic = new vscode.Diagnostic(
            range,
            'String literals are prohibited in QPI contracts (they can reference arbitrary memory). Use STATIC_ASSERT from qpi.h, which does not require a string literal.',
            vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = 'qubic-qpi';
        diagnostic.code = 'QPI004';
        diagnostics.push(diagnostic);
    }
}

// ---------------------------------------------------------------------------
// checkCharLiteral — QPI005 Error
// Character literals ('...') are not supported in QPI contracts.
// ---------------------------------------------------------------------------
function checkCharLiteral(
    commentFree: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
): void {
    for (let i = 0; i < commentFree.length; i++) {
        if (commentFree[i] !== "'") {
            continue;
        }
        const start = i;
        i++;
        while (i < commentFree.length && commentFree[i] !== "'") {
            if (commentFree[i] === '\\') {
                i++;
            }
            i++;
        }
        i++; // past closing '
        const range = new vscode.Range(lineIndex, start, lineIndex, Math.min(i, commentFree.length));
        const diagnostic = new vscode.Diagnostic(
            range,
            "Character literals (') are prohibited in QPI contracts.",
            vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = 'qubic-qpi';
        diagnostic.code = 'QPI005';
        diagnostics.push(diagnostic);
    }
}

// ---------------------------------------------------------------------------
// checkRawDivision — QPI002 Error
// ---------------------------------------------------------------------------
function checkRawDivision(
    stripped: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
): void {
    const divisionRegex = /(?<![/*=])\/(?![/*=])/g;
    let match: RegExpExecArray | null;

    while ((match = divisionRegex.exec(stripped)) !== null) {
        const col = match.index;
        const range = new vscode.Range(lineIndex, col, lineIndex, col + 1);
        const diagnostic = new vscode.Diagnostic(
            range,
            "The '/' operator is prohibited in QPI contracts (division by zero can yield inconsistent state). Use div(a, b), which returns zero when the divisor is zero.",
            vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = 'qubic-qpi';
        diagnostic.code = 'QPI002';
        diagnostics.push(diagnostic);
    }
}

// ---------------------------------------------------------------------------
// checkRawModulo — QPI003 Error
// Raw '%' modulo produces undefined behaviour in the Qubic execution
// environment. Use mod(a, b) instead.
// ---------------------------------------------------------------------------
function checkRawModulo(
    stripped: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
): void {
    // Match '%' that is not part of '%=' assignment
    const moduloRegex = /(?<!=)%(?!=)/g;
    let match: RegExpExecArray | null;

    while ((match = moduloRegex.exec(stripped)) !== null) {
        const col = match.index;
        const range = new vscode.Range(lineIndex, col, lineIndex, col + 1);
        const diagnostic = new vscode.Diagnostic(
            range,
            "The '%' operator is prohibited in QPI contracts. Use mod(a, b), which returns zero when the divisor is zero.",
            vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = 'qubic-qpi';
        diagnostic.code = 'QPI003';
        diagnostics.push(diagnostic);
    }
}

// ---------------------------------------------------------------------------
// checkArraySubscript — QPI006 Error
// Array subscripts ([ ]) are not supported; use the QPI Array type.
// ---------------------------------------------------------------------------
function checkArraySubscript(
    stripped: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
): void {
    for (let i = 0; i < stripped.length; i++) {
        if (stripped[i] === '[' || stripped[i] === ']') {
            const range = new vscode.Range(lineIndex, i, lineIndex, i + 1);
            const diagnostic = new vscode.Diagnostic(
                range,
                `The characters '[' and ']' are prohibited in QPI contracts (no raw arrays or unchecked buffer indexing). Use QPI Array and related types instead.`,
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = 'qubic-qpi';
            diagnostic.code = 'QPI006';
            diagnostics.push(diagnostic);
        }
    }
}

// ---------------------------------------------------------------------------
// checkEllipsis — QPI007 Error
// Variadic / ellipsis (...) is not supported in QPI contracts.
// ---------------------------------------------------------------------------
function checkEllipsis(
    stripped: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
): void {
    let idx = stripped.indexOf('...');
    while (idx !== -1) {
        const range = new vscode.Range(lineIndex, idx, lineIndex, idx + 3);
        const diagnostic = new vscode.Diagnostic(
            range,
            "Variadic arguments, template parameter packs, and function parameter packs ('...') are prohibited in QPI contracts.",
            vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = 'qubic-qpi';
        diagnostic.code = 'QPI007';
        diagnostics.push(diagnostic);
        idx = stripped.indexOf('...', idx + 3);
    }
}

// ---------------------------------------------------------------------------
// checkScopeOperator — QPI008 Warning
// '::' is only allowed for types defined in the same contract or qpi.h.
// ---------------------------------------------------------------------------
function checkScopeOperator(
    stripped: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
    definedNames: Set<string>,
): void {
    const regex = /(?:(\w+)\s*)?::/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(stripped)) !== null) {
        const name = match[1];
        if (name && (definedNames.has(name) || name === 'QPI')) {
            continue; // OK — type/namespace from this contract or qpi.h (e.g. QPI::…)
        }
        const col = match.index;
        const len = match[0].length;
        const range = new vscode.Range(lineIndex, col, lineIndex, col + len);
        const msg = name
            ? `'${name}::' is not a struct, enum, or namespace from this contract (or QPI from qpi.h). The scope operator '::' is prohibited except for those cases.`
            : "Leading '::' (global scope) is prohibited in QPI contracts.";
        const diagnostic = new vscode.Diagnostic(
            range,
            msg,
            vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = 'qubic-qpi';
        diagnostic.code = 'QPI008';
        diagnostics.push(diagnostic);
    }
}

// Keywords that do not produce expression values — when followed by '*',
// the '*' is a pointer operator, not multiplication.
const NON_EXPR_KEYWORDS = new Set([
    'return', 'throw', 'case', 'goto', 'new', 'delete',
    'sizeof', 'alignof', 'typeof',
    'const', 'volatile', 'static', 'extern', 'register',
    'signed', 'unsigned', 'short', 'long',
    'void', 'int', 'char', 'bool',
    'sint8', 'sint16', 'sint32', 'sint64',
    'uint8', 'uint16', 'uint32', 'uint64',
    'id', 'bit',
]);

// ---------------------------------------------------------------------------
// checkPointerStar — QPI009 Error
// Pointer operators (* for dereference / declaration) are not allowed.
// Multiplication is permitted — distinguished by checking whether '*' has
// an expression-producing left operand.
// ---------------------------------------------------------------------------
function checkPointerStar(
    stripped: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
): void {
    for (let i = 0; i < stripped.length; i++) {
        if (stripped[i] !== '*') {
            continue;
        }

        // Look left, skipping spaces, for an expression-end token
        let left = i - 1;
        while (left >= 0 && stripped[left] === ' ') {
            left--;
        }

        let isMultiplication = left >= 0 && /[\w)]/.test(stripped[left]);

        // If the preceding word is a keyword/type, it is a pointer decl
        if (isMultiplication && left >= 0 && /\w/.test(stripped[left])) {
            let wordStart = left;
            while (wordStart > 0 && /\w/.test(stripped[wordStart - 1])) {
                wordStart--;
            }
            const word = stripped.substring(wordStart, left + 1);
            if (NON_EXPR_KEYWORDS.has(word)) {
                isMultiplication = false;
            }
        }

        if (isMultiplication) {
            continue;
        }

        const range = new vscode.Range(lineIndex, i, lineIndex, i + 1);
        const diagnostic = new vscode.Diagnostic(
            range,
            "Defining, casting, and dereferencing pointers is prohibited; '*' is only allowed for multiplication.",
            vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = 'qubic-qpi';
        diagnostic.code = 'QPI009';
        diagnostics.push(diagnostic);
    }
}

// ---------------------------------------------------------------------------
// checkDoubleUnderscore — QPI013 Error
// Double-underscore identifiers are reserved and not permitted.
// ---------------------------------------------------------------------------
function checkDoubleUnderscore(
    stripped: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
): void {
    const regex = /__/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(stripped)) !== null) {
        const col = match.index;
        const range = new vscode.Range(lineIndex, col, lineIndex, col + 2);
        const diagnostic = new vscode.Diagnostic(
            range,
            "Double underscores '__' are reserved for internal/compiler use and must not appear in a contract.",
            vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = 'qubic-qpi';
        diagnostic.code = 'QPI013';
        diagnostics.push(diagnostic);
    }
}

// ---------------------------------------------------------------------------
// checkTypedefUsingScope — QPI016 Error
// typedef and using are only allowed in local scope; exception: using namespace QPI
// at file scope (see QPI language rules).
// ---------------------------------------------------------------------------
function checkTypedefUsingScope(
    stripped: string,
    lineIndex: number,
    braceDepthAtLineStart: number,
    diagnostics: vscode.Diagnostic[],
): void {
    const typedefRegex = /\btypedef\b/g;
    let match: RegExpExecArray | null;

    while ((match = typedefRegex.exec(stripped)) !== null) {
        const depth = braceDepthBeforeIndexInLine(stripped, match.index, braceDepthAtLineStart);
        if (depth === 0) {
            const col = match.index;
            const range = new vscode.Range(lineIndex, col, lineIndex, col + 'typedef'.length);
            const diagnostic = new vscode.Diagnostic(
                range,
                "'typedef' is only allowed in local scope (e.g. inside structs or procedures).",
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = 'qubic-qpi';
            diagnostic.code = 'QPI016';
            diagnostics.push(diagnostic);
        }
    }

    const masked = stripped.replace(/using\s+namespace\s+QPI\b/g, (s) => ' '.repeat(s.length));
    const usingRegex = /\busing\b/g;

    while ((match = usingRegex.exec(masked)) !== null) {
        const depth = braceDepthBeforeIndexInLine(masked, match.index, braceDepthAtLineStart);
        if (depth === 0) {
            const col = match.index;
            const range = new vscode.Range(lineIndex, col, lineIndex, col + 'using'.length);
            const diagnostic = new vscode.Diagnostic(
                range,
                "'using' is only allowed in local scope except 'using namespace QPI' at global scope.",
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = 'qubic-qpi';
            diagnostic.code = 'QPI016';
            diagnostics.push(diagnostic);
        }
    }
}

// ---------------------------------------------------------------------------
// checkProhibitedKeywords — QPI014 Error
// Keywords and constructs forbidden by QPI (excluding native integers — QPI015).
// ---------------------------------------------------------------------------
const PROHIBITED_KEYWORD_MESSAGES: Record<string, string> = {
    double: 'Floating-point types (float and double) are prohibited; their arithmetic is not well-defined in contracts.',
    float: 'Floating-point types (float and double) are prohibited; their arithmetic is not well-defined in contracts.',
    union: "The keyword 'union' is prohibited — use plain structs for clarity and auditable code.",
    const_cast: "'const_cast' is prohibited in QPI contracts.",
    QpiContext: "'QpiContext' is prohibited in QPI contracts.",
};

// Pre-compiled patterns — avoids recompiling the same regex on every line.
const PROHIBITED_KEYWORD_PATTERNS: Array<[string, RegExp]> =
    Object.keys(PROHIBITED_KEYWORD_MESSAGES).map((kw) => [kw, new RegExp(`\\b${kw}\\b`, 'g')] as [string, RegExp]);

function checkProhibitedKeywords(
    stripped: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
): void {
    for (const [kw, pattern] of PROHIBITED_KEYWORD_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(stripped)) !== null) {
            const col = match.index;
            const range = new vscode.Range(lineIndex, col, lineIndex, col + kw.length);
            const diagnostic = new vscode.Diagnostic(
                range,
                PROHIBITED_KEYWORD_MESSAGES[kw],
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = 'qubic-qpi';
            diagnostic.code = 'QPI014';
            diagnostics.push(diagnostic);
        }
    }
}

// ---------------------------------------------------------------------------
// checkNativeIntegerKeywords — QPI015 Error
// Native C/C++ integer-related keywords are prohibited; use QPI integer types.
// ---------------------------------------------------------------------------
const NATIVE_INTEGER_KEYWORDS = ['int', 'char', 'short', 'long', 'bool', 'signed', 'unsigned'];

// Pre-compiled patterns — avoids recompiling the same regex on every line.
const NATIVE_INTEGER_KEYWORD_PATTERNS: Array<[string, RegExp]> =
    NATIVE_INTEGER_KEYWORDS.map((kw) => [kw, new RegExp(`\\b${kw}\\b`, 'g')] as [string, RegExp]);

function checkNativeIntegerKeywords(
    stripped: string,
    lineIndex: number,
    diagnostics: vscode.Diagnostic[],
): void {
    for (const [kw, pattern] of NATIVE_INTEGER_KEYWORD_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;

        while ((match = pattern.exec(stripped)) !== null) {
            const col = match.index;
            const range = new vscode.Range(lineIndex, col, lineIndex, col + kw.length);
            const diagnostic = new vscode.Diagnostic(
                range,
                'Native C/C++ integer and bool keywords are prohibited; use sint8, uint8, sint16, uint16, sint32, uint32, sint64, uint64, bit, id, etc.',
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = 'qubic-qpi';
            diagnostic.code = 'QPI015';
            diagnostics.push(diagnostic);
        }
    }
}

// ---------------------------------------------------------------------------
// checkBlockBalance — ensures an opening macro has a matching closing macro
// e.g. BEGIN_EPOCH must be paired with END_EPOCH (QPI010)
//      BEGIN_TICK  must be paired with END_TICK  (QPI011)
// ---------------------------------------------------------------------------
function checkBlockBalance(
    document: vscode.TextDocument,
    text: string,
    openKeyword: string,
    closeKeyword: string,
    code: string,
    diagnostics: vscode.Diagnostic[],
): void {
    const openRegex = new RegExp(`\\b${openKeyword}\\b`, 'g');
    const closeRegex = new RegExp(`\\b${closeKeyword}\\b`, 'g');

    const openCount = (text.match(openRegex) ?? []).length;
    const closeCount = (text.match(closeRegex) ?? []).length;

    if (openCount === closeCount) {
        return;
    }

    // Find the line of the first unmatched opening keyword to anchor the diagnostic
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        if (new RegExp(`\\b${openKeyword}\\b`).test(lineText)) {
            const col = lineText.indexOf(openKeyword);
            const range = new vscode.Range(i, col, i, col + openKeyword.length);
            const diagnostic = new vscode.Diagnostic(
                range,
                openCount > closeCount
                    ? `'${openKeyword}' block is missing its closing '${closeKeyword}'.`
                    : `'${closeKeyword}' found without a matching '${openKeyword}'.`,
                vscode.DiagnosticSeverity.Error,
            );
            diagnostic.source = 'qubic-qpi';
            diagnostic.code = code;
            diagnostics.push(diagnostic);
            break;
        }
    }
}

// ---------------------------------------------------------------------------
// checkUnregisteredEntrypoints — QPI012
// Every PUBLIC_PROCEDURE(Name) and PUBLIC_FUNCTION(Name) must appear in
// REGISTER_USER_PROCEDURE(Name, ...) or REGISTER_USER_FUNCTION(Name, ...)
// ---------------------------------------------------------------------------
function checkUnregisteredEntrypoints(
    document: vscode.TextDocument,
    text: string,
    diagnostics: vscode.Diagnostic[],
): void {
    // Collect all declared entrypoint names with their line positions
    const declaredRegex = /\bPUBLIC_(?:PROCEDURE|FUNCTION)(?:_WITH_LOCALS)?\s*\(\s*(\w+)\s*\)/g;
    const declared = new Map<string, number>(); // name → lineIndex
    let match: RegExpExecArray | null;

    while ((match = declaredRegex.exec(text)) !== null) {
        const name = match[1];
        if (!declared.has(name)) {
            const lineIndex = document.positionAt(match.index).line;
            declared.set(name, lineIndex);
        }
    }

    if (declared.size === 0) {
        return;
    }

    // Collect all registered names
    const registeredRegex = /\bREGISTER_USER_(?:PROCEDURE|FUNCTION)\s*\(\s*(\w+)\s*,/g;
    const registered = new Set<string>();

    while ((match = registeredRegex.exec(text)) !== null) {
        registered.add(match[1]);
    }

    // Flag each declared name that is not registered
    for (const [name, lineIndex] of declared) {
        if (registered.has(name)) {
            continue;
        }

        const lineText = document.lineAt(lineIndex).text;
        const col = lineText.indexOf(name);
        const range = new vscode.Range(
            lineIndex,
            col >= 0 ? col : 0,
            lineIndex,
            col >= 0 ? col + name.length : lineText.length,
        );
        const diagnostic = new vscode.Diagnostic(
            range,
            `'${name}' is declared but never registered. Add REGISTER_USER_PROCEDURE(${name}, <index>) or REGISTER_USER_FUNCTION(${name}, <index>) inside REGISTER_USER_FUNCTIONS_AND_PROCEDURES.`,
            vscode.DiagnosticSeverity.Warning,
        );
        diagnostic.source = 'qubic-qpi';
        diagnostic.code = 'QPI012';
        diagnostics.push(diagnostic);
    }
}

// ---------------------------------------------------------------------------
// parseContractDocComment — parses a /** ... */ JSDoc-style block above the
// contract struct declaration and returns structured metadata.
// ---------------------------------------------------------------------------
function parseContractDocComment(
    text: string,
    document: vscode.TextDocument,
): ContractDocMeta | undefined {
    // Find QPI_CONTRACT_DECLARATION_REGEX match position
    const contractMatch = QPI_CONTRACT_DECLARATION_REGEX.exec(stripStrings(stripAllComments(text)));
    if (!contractMatch) return undefined;

    // Find the /** ... */ block immediately before the struct declaration.
    // We search in the raw text (before stripping) in the region up to the struct match.
    const textBeforeStruct = text.slice(0, contractMatch.index);
    // Match the LAST /** ... */ block before the struct
    const docRegex = /\/\*\*([\s\S]*?)\*\//g;
    let docMatch: RegExpExecArray | null;
    let lastMatch: RegExpExecArray | null = null;
    while ((docMatch = docRegex.exec(textBeforeStruct)) !== null) {
        lastMatch = docMatch;
    }

    if (!lastMatch) return undefined;

    // Parse the lines inside the doc-comment
    const rawContent = lastMatch[1];
    const lines = rawContent.split('\n').map(l => l.replace(/^\s*\*\s?/, '').trimEnd());

    const meta: ContractDocMeta = {
        contract: undefined,
        description: undefined,
        author: undefined,
        version: undefined,
        procedures: [],
        functions: [],
        states: [],
        commentRange: new vscode.Range(
            document.positionAt(lastMatch.index),
            document.positionAt(lastMatch.index + lastMatch[0].length),
        ),
    };

    let hasRecognizedTag = false;

    for (const line of lines) {
        const tagMatch = line.match(/^@(\w+)\s+(.*)/);
        if (!tagMatch) continue;
        const [, tag, rest] = tagMatch;

        // Split on first em-dash or ' - ' to get name and description
        const splitTag = (value: string): ContractDocTag => {
            const sep = value.match(/\s+[—\-]\s+/);
            if (sep && sep.index !== undefined) {
                return {
                    name: value.slice(0, sep.index).trim(),
                    description: value.slice(sep.index + sep[0].length).trim(),
                };
            }
            return { name: value.trim(), description: '' };
        };

        hasRecognizedTag = true;
        switch (tag) {
            case 'contract':    meta.contract = rest.trim(); break;
            case 'description': meta.description = rest.trim(); break;
            case 'author':      meta.author = rest.trim(); break;
            case 'version':     meta.version = rest.trim(); break;
            case 'procedure':   meta.procedures.push(splitTag(rest)); break;
            case 'function':    meta.functions.push(splitTag(rest)); break;
            case 'state':       meta.states.push(splitTag(rest)); break;
        }
    }

    return hasRecognizedTag ? meta : undefined;
}

// ---------------------------------------------------------------------------
// buildContractDocHover — creates a Hover card for contract doc metadata
// ---------------------------------------------------------------------------
function buildContractDocHover(meta: ContractDocMeta): vscode.Hover {
    const md = new vscode.MarkdownString();
    md.isTrusted = true;

    md.appendMarkdown(`## ${meta.contract ?? 'Contract'}\n\n`);

    if (meta.description) {
        md.appendMarkdown(`${meta.description}\n\n`);
    }

    const infoRows: string[] = [];
    if (meta.author)  infoRows.push(`| **Author** | ${meta.author} |`);
    if (meta.version) infoRows.push(`| **Version** | ${meta.version} |`);
    if (infoRows.length > 0) {
        md.appendMarkdown(`| | |\n|---|---|\n${infoRows.join('\n')}\n\n`);
    }

    if (meta.procedures.length > 0) {
        md.appendMarkdown(`**Procedures**\n`);
        for (const p of meta.procedures) {
            md.appendMarkdown(p.description
                ? `- \`${p.name}\` — ${p.description}\n`
                : `- \`${p.name}\`\n`);
        }
        md.appendMarkdown('\n');
    }

    if (meta.functions.length > 0) {
        md.appendMarkdown(`**Functions**\n`);
        for (const f of meta.functions) {
            md.appendMarkdown(f.description
                ? `- \`${f.name}\` — ${f.description}\n`
                : `- \`${f.name}\`\n`);
        }
        md.appendMarkdown('\n');
    }

    if (meta.states.length > 0) {
        md.appendMarkdown(`**State**\n`);
        for (const s of meta.states) {
            md.appendMarkdown(s.description
                ? `- \`${s.name}\` — ${s.description}\n`
                : `- \`${s.name}\`\n`);
        }
    }

    return new vscode.Hover(md);
}

// ---------------------------------------------------------------------------
// checkDocCommentCoverage — QPI017
// Validates that @procedure and @function tags in the doc-comment match
// actual PUBLIC_PROCEDURE / PUBLIC_FUNCTION declarations in the contract body.
// ---------------------------------------------------------------------------
function checkDocCommentCoverage(
    document: vscode.TextDocument,
    diagnostics: vscode.Diagnostic[],
): void {
    const meta = getContractDocMeta(document);
    if (!meta) return;

    // Collect actually-defined procedure and function names from stripped text
    const strippedText = stripAllComments(document.getText());
    const declaredProcedures = new Set<string>();
    const declaredFunctions = new Set<string>();
    const declRegex = /\bPUBLIC_(PROCEDURE|FUNCTION)(?:_WITH_LOCALS)?\s*\(\s*(\w+)\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = declRegex.exec(strippedText)) !== null) {
        if (m[1] === 'PROCEDURE') {
            declaredProcedures.add(m[2]);
        } else {
            declaredFunctions.add(m[2]);
        }
    }

    const rawText = document.getText();

    // Check @procedure tags
    for (const tag of meta.procedures) {
        if (!declaredProcedures.has(tag.name)) {
            const tagPattern = new RegExp(`@procedure\\s+${escapeRegExp(tag.name)}\\b`);
            const tagMatch = tagPattern.exec(rawText);
            const range = tagMatch
                ? new vscode.Range(
                    document.positionAt(tagMatch.index),
                    document.positionAt(tagMatch.index + tagMatch[0].length),
                )
                : meta.commentRange;

            const diag = new vscode.Diagnostic(
                range,
                `'${tag.name}' is declared in @procedure but no PUBLIC_PROCEDURE(${tag.name}) was found in the contract body.`,
                vscode.DiagnosticSeverity.Warning,
            );
            diag.source = 'qubic-qpi';
            diag.code = 'QPI017';
            diagnostics.push(diag);
        }
    }

    // Check @function tags
    for (const tag of meta.functions) {
        if (!declaredFunctions.has(tag.name)) {
            const tagPattern = new RegExp(`@function\\s+${escapeRegExp(tag.name)}\\b`);
            const tagMatch = tagPattern.exec(rawText);
            const range = tagMatch
                ? new vscode.Range(
                    document.positionAt(tagMatch.index),
                    document.positionAt(tagMatch.index + tagMatch[0].length),
                )
                : meta.commentRange;

            const diag = new vscode.Diagnostic(
                range,
                `'${tag.name}' is declared in @function but no PUBLIC_FUNCTION(${tag.name}) was found in the contract body.`,
                vscode.DiagnosticSeverity.Warning,
            );
            diag.source = 'qubic-qpi';
            diag.code = 'QPI017';
            diagnostics.push(diag);
        }
    }
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// buildContractTemplate — generates a minimal QPI contract file
// ---------------------------------------------------------------------------
function buildContractTemplate(name: string): string {
    const today = new Date().toISOString().slice(0, 10);
    const separator = '    // ---------------------------------------------------------------';

    const lines: string[] = [
        `// Qubic Smart Contract: ${name}`,
        `// Created: ${today}`,
        `//`,
        `// This file uses the Qubic Public Interface (QPI).`,
        `// No preprocessor (#) except optional #include "qpi.h" for IntelliSense — remove before deploy.`,
        `// Use div() and mod() instead of / and %.`,
        ``,
        `using namespace QPI;`,
        ``,
        `struct ${name} : public ContractBase`,
        `{`,
        separator,
        `    // State variables`,
        separator,
        `    uint64 totalInvocations;`,
        ``,
        separator,
        `    // Input / Output structs`,
        separator,
        `    struct Invoke_input`,
        `    {`,
        `        uint64 amount;`,
        `    };`,
        ``,
        `    struct Invoke_output`,
        `    {`,
        `        uint64 result;`,
        `    };`,
        ``,
        separator,
        `    // Procedure: Invoke`,
        separator,
        `    PUBLIC_PROCEDURE(Invoke)`,
        `    {`,
        `        state.mut().totalInvocations = state.get().totalInvocations + 1;`,
        `        output.result = input.amount;`,
        `    }`,
        ``,
        separator,
        `    // Registration`,
        separator,
        `    REGISTER_USER_FUNCTIONS_AND_PROCEDURES`,
        `    {`,
        `        REGISTER_USER_PROCEDURE(Invoke, 1);`,
        `    }`,
        ``,
        separator,
        `    // Initialization`,
        separator,
        `    INITIALIZE()`,
        `    {`,
        `    }`,
        `};`,
        ``,
    ];

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// checkPublicInterfaceTypes - QPI018 Error
//
// The input/output structs of contract user procedures and functions may only
// use integer and boolean types (uint64, sint8, bit, ...) as well as id, Array
// and BitArray, plus structs built from those. Complex types that may have an
// inconsistent internal state - Collection, LinkedList, HashMap, HashSet - are
// forbidden there. See qubic/core doc/contracts.md.
// ---------------------------------------------------------------------------
const FORBIDDEN_INTERFACE_TYPES = ['Collection', 'LinkedList', 'HashMap', 'HashSet'];

function checkPublicInterfaceTypes(
    document: vscode.TextDocument,
    text: string,
    diagnostics: vscode.Diagnostic[],
): void {
    // Locate `struct <name>_input {` / `struct <name>_output {` blocks and scan
    // their bodies. Brace counting keeps nested structs inside the block.
    const structRegex = /\bstruct\s+(\w+_(?:input|output))\s*\{/g;
    let match: RegExpExecArray | null;

    while ((match = structRegex.exec(text)) !== null) {
        const structName = match[1];
        let depth = 1;
        let i = match.index + match[0].length;

        while (i < text.length && depth > 0) {
            const ch = text[i];
            if (ch === '{') {
                depth++;
            } else if (ch === '}') {
                depth--;
            }
            i++;
        }

        const bodyStart = match.index + match[0].length;
        const body = text.slice(bodyStart, Math.max(bodyStart, i - 1));

        for (const typeName of FORBIDDEN_INTERFACE_TYPES) {
            const typeRegex = new RegExp('\\b' + typeName + '\\s*<', 'g');
            let hit: RegExpExecArray | null;

            while ((hit = typeRegex.exec(body)) !== null) {
                const absolute = bodyStart + hit.index;
                const start = document.positionAt(absolute);
                const end = document.positionAt(absolute + typeName.length);
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(start, end),
                    `'${typeName}' is not allowed in '${structName}'. The input/output structs of public procedures and functions may only use integer and boolean types, id, Array, BitArray, and structs of those - complex containers may have an inconsistent internal state.`,
                    vscode.DiagnosticSeverity.Error,
                );
                diagnostic.source = 'qubic-qpi';
                diagnostic.code = 'QPI018';
                diagnostics.push(diagnostic);
            }
        }
    }
}
