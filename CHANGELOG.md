# Changelog

All notable changes to this extension are documented here.

## [1.2.0] - 2026-09-01

Sync with qubic/core v1.302.1 (Epoch 226). Previous baseline was v1.286.0 (Epoch 208).

### Added
- 8 QPI context methods: `computeMiningFunction`, `setShareholderProposal`,
  `setShareholderVotes`, `getOracleQuery`, `getOracleQueryStatus`, `getOracleReply`,
  `unsubscribeOracle`, `getOcInvocationStatus`
- Container types `LinkedList<T, L>` and `SlowAnySizeArray<T, L>`
- Oracle and outsourced-computation status constants (`ORACLE_QUERY_STATUS_*`,
  `OC_INVOCATION_STATUS_*`), plus `INVALID_PROPOSAL_INDEX`, `INVALID_VOTE_INDEX`, `NO_VOTE_VALUE`
- Hover documentation for ~32 previously undocumented macros (private entry points,
  `*_WITH_LOCALS` variants, `INITIALIZE`, `EXPAND`, `MIGRATE`, cross-contract calls,
  oracle/OC macros, `LOG_*`, share and transfer system procedures)
- Syntax highlighting for 58 QPI macros (previously 9)
- **QPI018** (Error): complex containers (`Collection`, `LinkedList`, `HashMap`, `HashSet`)
  are forbidden in `<name>_input` / `<name>_output` structs of public procedures and functions
- Test harness can now drive the real compiled linter (`realDiagsForText`), not only the
  re-implemented rule mirror; 9 new tests (72 total)

### Changed
- `QPI001` accepts directory-prefixed includes such as `#include "qpi/qpi.h"` as a Warning,
  matching the new `src/qpi/` layout in core v1.302.x (previously reported as an Error)
- README compatibility note now tracks v1.302.1 / Epoch 226

## [1.1.0] - 2026-04-13

### Added
- JSDoc-style contract metadata support (`@contract`, `@description`, `@author`, `@version`,
  `@procedure`, `@function`, `@state`)
- Hover documentation: hovering over the contract struct name shows the full metadata
- QPI017 validation: Warning when `@procedure`/`@function` is declared in the doc-comment
  but the corresponding `PUBLIC_PROCEDURE(X)` / `PUBLIC_FUNCTION(X)` is missing in the code
- `qpi-contract-doc` snippet: inserts a pre-filled JSDoc metadata template
- 5 new automated tests for QPI017 (63 tests total)

## [1.0.0] - 2026-04-10

### Added
- Compatibility note in README: tested against qubic/core v1.286.0 (Epoch 208)

### Fixed
- Removed `.h` file extension claim — no longer hijacks C++ header files
- Fixed `qpi-contract` snippet: now includes `: public ContractBase` inheritance
- Fixed `qpi.transfer` return type (`void` → `sint64`) and description
- Fixed test harness: both completion providers correctly captured
- Fixed test harness: `#include "qpi.h"` correctly classified as Warning

### Changed
- Added 300 ms debounce to `onDidChangeTextDocument` for better performance
- tmLanguage grammar now uses catch-all `qpi.\w+` pattern (all 40 methods highlighted)
- tmLanguage type list completed: `Collection` casing fixed, added `HashMap`, `HashSet`,
  `ContractState`, `DateAndTime`, `NoData`, `m256i`, `uint128`, iterator types

## [0.4.0] - 2026-04-10

### Added
- 27 new `qpi.*` method completions: arbitrator, computor, dayOfWeek, millisecond, getEntity,
  numberOfPossessedShares, numberOfShares, isAssetIssued, isContractId, nextId, prevId,
  ipoBidId, ipoBidPrice, invocationReward, numberOfTickTransactions, now,
  getPrevSpectrumDigest, getPrevUniverseDigest, getPrevComputerDigest, signatureValidity,
  queryFeeReserve, acquireShares, releaseShares, distributeDividends, bidInIPO
- 63 QPI type completions with hover documentation: Array, HashMap, HashSet, Collection,
  ContractState, Entity, Asset, DateAndTime, NoData, uint128, bit, m256i, all array typedefs
  (bit_2…bit_4096, sint/uint variants, id_2/4/8), iterator types
- 50 QPI constant completions: NULL_ID, NULL_INDEX, INVALID_AMOUNT, NUMBER_OF_COMPUTORS,
  QUORUM, letter constants _A–_Z, JANUARY–DECEMBER, MONDAY–SUNDAY

### Fixed
- `issueAsset`: corrected parameter order and added missing `numberOfShares` parameter
- `transferShareOwnershipAndPossession`: added missing `possessor` parameter (now 6 params total)
- `burn`: added optional `contractIndexBurnedFor: uint32` second parameter
- `year()`: corrected return type from `uint16` to `uint8`
- QPI001 check in test harness now uses comment-stripped text (prevents false positives inside block comments)

### Changed
- QPI001 diagnostic split: `#include "qpi.h"` is now a **Warning** (dev-only); all other `#` lines are **Error**
- Smart contract detection tightened: linting now requires a full `struct/class ... : ContractBase` declaration

## [0.3.0] - 2026-03-28

### Added
- Contract Validator (QPI010, QPI011, QPI012)
- IntelliSense for all `qpi.*` functions
- Hover documentation for QPI methods and keywords
- QPI003 error squiggles

## [0.2.0] - 2026-03-15

### Added
- Linter for QPI restrictions (QPI001–QPI009, QPI013–QPI016)
- `Qubic: New Smart Contract` command
- Code snippets for contract structure

## [0.1.0] - 2026-03-01

### Added
- Initial release
- Syntax highlighting for QPI keywords, types, and macros
- Basic code snippets
