# Qubic QPI Language Support

VS Code extension providing language support for **Qubic Smart Contracts** written with the Qubic Public Interface (QPI).

> **Compatibility:** Tested against [qubic/core v1.302.1](https://github.com/qubic/core/releases/tag/v1.302.1) (Epoch 226, released 2026-08-31).
> The QPI API coverage in this extension reflects the `src/qpi/` headers at that release.
> Note that as of core v1.302.x the QPI header moved out of `src/contracts/qpi.h` into the modular `src/qpi/` layout
> (`qpi_types.h`, `qpi_containers.h`, `qpi_context.h`, `qpi_macros.h`, ...).
> If Qubic core has been updated since then, check [GitHub Issue #5](https://github.com/AndyQus/qubic-qpi-vscode/issues/5) for the latest sync status.

---

## Features

### Syntax Highlighting
- QPI control macros highlighted as keywords (`PUBLIC_PROCEDURE`, `BEGIN_EPOCH`, etc.)
- QPI built-in types styled as storage types (`id`, `sint64`, `uint64`, `Array`, etc.)
- QPI API calls styled as support functions (`qpi.transfer`, `qpi.K12`, etc.)
- Raw `#include` directives flagged as invalid (except `#include "qpi.h"` / `<qpi.h>` for local IntelliSense)
- Raw `/` and `%` operators flagged as illegal (use `div` / `mod`)

### Snippets
| Prefix | Description |
|---|---|
| `qpi-contract` | Full contract skeleton with state, I/O structs, epoch/tick hooks, and registration |
| `qpi-contract-doc` | JSDoc metadata block (`@contract`, `@description`, `@procedure`, etc.) for AI agents |
| `qpi-procedure` | `PUBLIC_PROCEDURE` block |
| `qpi-function` | `PUBLIC_FUNCTION` block |
| `qpi-procedure-locals` | `PUBLIC_PROCEDURE_WITH_LOCALS` block |
| `qpi-function-locals` | `PUBLIC_FUNCTION_WITH_LOCALS` block |
| `qpi-epoch` | `BEGIN_EPOCH` / `END_EPOCH` block |
| `qpi-tick` | `BEGIN_TICK` / `END_TICK` block |

Snippets are available in both `qpi` and `cpp` language modes.

### Linter (Diagnostics)
The extension analyses `.h` files that inherit from `ContractBase` and applies the [QPI C++ restrictions](https://docs.qubic.org/developers/qpi/) (no stack locals except via `_WITH_LOCALS` macros, no raw pointers/`[]`, no `#` except optional `qpi.h` include for IDE use, no `float`/`double`, use `div`/`mod` instead of `/`/`%`, no string/char literals, no `...`, no `__`, limited `::`, no `union`, controlled `typedef`/`using`, QPI integer types only, etc.):

| Code | Severity | Rule |
|---|---|---|
| `QPI001` | Warning / Error | **Warning:** `#include "qpi.h"` / `<qpi.h>` only (IDE helper — remove before deploy). **Error:** any other `#` line (other includes, `#define`, etc.) |
| `QPI002` | Error | `/` operator prohibited — use `div(a, b)` |
| `QPI003` | Error | `%` operator prohibited — use `mod(a, b)` |
| `QPI004` | Error | String literals (double quotes) prohibited |
| `QPI005` | Error | Character literals (single quotes) prohibited |
| `QPI006` | Error | `[` and `]` prohibited |
| `QPI007` | Error | `...` (variadic / parameter packs) prohibited |
| `QPI008` | Warning | `::` only for types/namespaces in this contract or `QPI` from `qpi.h` |
| `QPI009` | Error | `*` except for multiplication (no pointers) |
| `QPI010` | Error | `BEGIN_EPOCH` without matching `END_EPOCH` |
| `QPI011` | Error | `BEGIN_TICK` without matching `END_TICK` |
| `QPI012` | Warning | `PUBLIC_PROCEDURE` / `PUBLIC_FUNCTION` not registered |
| `QPI013` | Error | `__` (double underscore) prohibited |
| `QPI014` | Error | `float`, `double`, `union`, `const_cast`, `QpiContext` prohibited |
| `QPI015` | Error | Native C/C++ `int` / `char` / `short` / `long` / `bool` / `signed` / `unsigned` — use QPI types |
| `QPI016` | Error | `typedef` / `using` only in local scope; `using namespace QPI` allowed at file scope |
| `QPI017` | Warning | `@procedure` / `@function` declared in doc-comment but not found in contract body |
| `QPI018` | Error | `Collection` / `LinkedList` / `HashMap` / `HashSet` used in a `<name>_input` / `<name>_output` struct (public interface) |

The linter and validator run on file open, save, and every keystroke.

### Command: New Smart Contract
**Command palette:** `Qubic: New Smart Contract`

Prompts for a contract name, generates a `.h` file with a complete QPI skeleton, and opens it in the editor.

---

## Usage Guide

### 1. Install the Extension

Search for **"Qubic QPI Language Support"** in the VS Code Extensions panel (`Ctrl+Shift+X`) or install directly from the [Marketplace](https://marketplace.visualstudio.com/items?itemName=AndyQus.qubic-org-qpi).

### 2. Create a New Smart Contract

Open the Command Palette (`Ctrl+Shift+P`) and run:

```
Qubic: New Smart Contract
```

Enter a contract name (letters, digits, underscores). The extension creates a ready-to-use `.h` file with a complete QPI skeleton and opens it in the editor.

### 3. IntelliSense for `qpi.*`

While editing any `.h` file that contains QPI keywords, type `qpi.` to get an autocomplete list of all available API methods. Each entry shows the full signature, return type, and a description. Tab stops let you fill in arguments quickly.

![IntelliSense example: type qpi. and pick from the list](images/screenshot.png)

### 4. Hover Documentation

Hover over any `qpi.*` call or QPI keyword (`PUBLIC_PROCEDURE`, `BEGIN_EPOCH`, etc.) to see inline documentation — signature, return type, and a usage description — without leaving the editor.

### 5. Code Snippets

Type one of the snippet prefixes and press `Tab`:

| Prefix | What it inserts |
|---|---|
| `qpi-contract` | Complete contract skeleton |
| `qpi-contract-doc` | JSDoc metadata block for AI coding agents |
| `qpi-procedure` | `PUBLIC_PROCEDURE` block |
| `qpi-function` | `PUBLIC_FUNCTION` block |
| `qpi-procedure-locals` | `PUBLIC_PROCEDURE_WITH_LOCALS` block |
| `qpi-function-locals` | `PUBLIC_FUNCTION_WITH_LOCALS` block |
| `qpi-epoch` | `BEGIN_EPOCH` / `END_EPOCH` block |
| `qpi-tick` | `BEGIN_TICK` / `END_TICK` block |

Snippets work in both `qpi` and `cpp` language modes.

### 6. Linter Warnings and Errors

The linter activates automatically for `.h` files that contain QPI keywords. Problems appear in the **Problems** panel (`Ctrl+Shift+M`) and as coloured underlines in the editor:

| Code | Colour | What to do |
|---|---|---|
| `QPI001` | Yellow (**Warning**) for `#include` *qpi.h* only; red (**Error**) for any other `#` | Remove all `#` before deploy; `qpi.h` is warning-level as a dev-only include |
| `QPI002` | Red (Error) | Replace `/` with `div(a, b)` |
| `QPI003` | Red (Error) | Replace `%` with `mod(a, b)` |
| `QPI004`–`QPI009`, `QPI013`–`QPI016` | Red (Error) | Match the restriction named in the Problems panel message |
| `QPI008` | Yellow (Warning) | Use `::` only for contract types or `QPI::…` from `qpi.h` |
| `QPI010` | Red (Error) | Add missing `END_EPOCH` after `BEGIN_EPOCH` |
| `QPI011` | Red (Error) | Add missing `END_TICK` after `BEGIN_TICK` |
| `QPI012` | Yellow (Warning) | Register the procedure/function (see Section 7) |

### 7. Contract Validator

The **Contract Validator** checks the overall structure of a QPI contract and catches mistakes that the line-level linter cannot see.

**QPI010 — Missing `END_EPOCH`**

Every `BEGIN_EPOCH` block must be closed with `END_EPOCH`. If the closing macro is absent the contract will not compile inside the Qubic node.

```cpp
// Wrong — triggers QPI010
BEGIN_EPOCH
{
}
// END_EPOCH  ← missing

// Correct
BEGIN_EPOCH
{
}
END_EPOCH
```

**QPI011 — Missing `END_TICK`**

Same rule as QPI010, but for tick hooks.

```cpp
// Correct
BEGIN_TICK
{
}
END_TICK
```

**QPI012 — Unregistered procedure or function**

Every `PUBLIC_PROCEDURE` and `PUBLIC_FUNCTION` you declare must be listed inside the `REGISTER_USER_FUNCTIONS_AND_PROCEDURES` block. Omitting the registration means the Qubic network will never call your entry point.

```cpp
// Declaration (triggers QPI012 if not registered below)
PUBLIC_PROCEDURE(Transfer)
{
    // ...
}

// Registration block — Transfer must appear here
REGISTER_USER_FUNCTIONS_AND_PROCEDURES
{
    REGISTER_USER_PROCEDURE(Transfer, 1);   // ← required
}
```

The index (`1`, `2`, …) is the call index used by clients to invoke the entry point. Each entry point needs a unique index.

---

## Contract Metadata for AI Coding Agents

Add a JSDoc-style block directly above your contract struct to document it for AI coding agents (Copilot, Cursor, Claude, etc.) and developers:

```cpp
/**
 * @contract TransferContract
 * @description Handles peer-to-peer QU transfers with optional escrow
 * @author AndyQus
 * @version 1
 * @procedure Transfer — Transfers QU from caller to recipient
 * @procedure Escrow — Holds QU in escrow until release condition is met
 * @function GetBalance — Returns current contract balance
 * @state transferCount — Number of successful transfers
 */
struct TransferContract : public ContractBase {
```

Use the `qpi-contract-doc` snippet to insert a pre-filled template.

**Hover documentation:** Hovering over the contract struct name shows the full metadata inline.

**QPI017 validation:** A Warning is emitted if a `@procedure` or `@function` is declared in the doc-comment but the corresponding `PUBLIC_PROCEDURE(X)` / `PUBLIC_FUNCTION(X)` is not found in the contract body.

---

## QPI-Specific Rules

### Preprocessor (`#`)
All preprocessor directives are prohibited in deployed contracts. For local development you may add `#include "qpi.h"` or `#include <qpi.h>` so IntelliSense understands QPI types; remove every `#` line before the contract is deployed. Use QPI built-in types and the `qpi` API object exclusively.

### Integer Division and Modulo
The `/` and `%` operators are prohibited in QPI contracts (e.g. division by zero can yield inconsistent state). Always use:
- `div(dividend, divisor)` instead of `a / b` (returns zero if the divisor is zero)
- `mod(dividend, divisor)` instead of `a % b` (returns zero if the divisor is zero)

### `div()` and `mod()` are safe and valid
The linter flags raw `/` and `%` but does **not** flag `div()` or `mod()` — they are the required QPI idioms.

### Supported QPI API (`qpi.*`)

**Identity & Context**
| Method | Description |
|---|---|
| `invocator()` | Returns the `id` of the **direct caller** of this contract invocation. |
| `originator()` | Returns the `id` of the **originator** of the transaction (the entity that signed it). |
| `arbitrator()` | Returns the `id` of the current **arbitrator**. |
| `computor(index: uint16)` | Returns the `id` of the computor at the given index (0–675). |
| `isContractId(id: id)` | Returns `1` if the given `id` belongs to a smart contract. |

**Time**
| Method | Description |
|---|---|
| `tick()` | Returns the **current tick number** of the Qubic network. |
| `epoch()` | Returns the **current epoch number** of the Qubic network. |
| `year()` | Returns the **current UTC year** offset (e.g. 25 for 2025). |
| `month()` | Returns the **current UTC month** (1–12). |
| `day()` | Returns the **current UTC day of month** (1–31). |
| `hour()` | Returns the **current UTC hour** (0–23). |
| `minute()` | Returns the **current UTC minute** (0–59). |
| `second()` | Returns the **current UTC second** (0–59). |
| `millisecond()` | Returns the **current UTC millisecond** (0–999). |
| `dayOfWeek(year: uint8, month: uint8, day: uint8)` | Returns the day of week for the given date (0 = Wednesday, ..., 6 = Tuesday). |
| `now()` | Returns the current date and time as a `DateAndTime` struct. |

**Balance & Transfer**
| Method | Description |
|---|---|
| `transfer(dest: id, amount: sint64)` | Transfers `amount` QU from this contract to `dest`. Returns `false` if the balance is insufficient. |
| `burn(amount: sint64, contractIndexBurnedFor: uint32 = 0)` | Burns `amount` QU permanently — removes them from circulation. Optional `contractIndexBurnedFor` defaults to 0 (this contract). Returns the amount burned or a negative value on error. |
| `invocationReward()` | Returns the amount of QU sent with the current invocation. |
| `queryFeeReserve(contractIndex: uint32)` | Returns the fee reserve of the contract at `contractIndex` (0 = this contract). |
| `distributeDividends(amountPerShare: sint64)` | Distributes `amountPerShare` QU to every shareholder of this contract. Returns `1` on success. |

**Hashing & Crypto**
| Method | Description |
|---|---|
| `K12(data: T)` | Computes the **Qubic K12 hash** of `data` and returns the result as an `id`. |
| `signatureValidity(entity: id, digest: id, signature: Array<sint8, 64>)` | Returns `1` if the signature is valid for the given entity and digest. |
| `getPrevSpectrumDigest()` | Returns the spectrum digest of the previous tick. |
| `getPrevUniverseDigest()` | Returns the universe digest of the previous tick. |
| `getPrevComputerDigest()` | Returns the computer digest of the previous tick. |

**Spectrum / Entities**
| Method | Description |
|---|---|
| `getEntity(id: id, entity: Entity)` | Fills `entity` with the spectrum entry for the given `id`. Returns `1` if found, `0` otherwise. |
| `nextId(currentId: id)` | Returns the next `id` in the spectrum after `currentId`. |
| `prevId(currentId: id)` | Returns the previous `id` in the spectrum before `currentId`. |
| `numberOfTickTransactions()` | Returns the number of transactions in the current tick. |

**Assets**
| Method | Description |
|---|---|
| `issueAsset(name: uint64, numberOfDecimalPlaces: sint8, numberOfShares: sint64, unitOfMeasurement: uint64)` | Issues a new asset on the Qubic network. Returns the number of issued shares, or a negative value on failure. |
| `transferShareOwnershipAndPossession(assetName: uint64, issuer: id, owner: id, possessor: id, numberOfShares: sint64, newOwnerAndPossessor: id)` | Transfers ownership and possession of `numberOfShares` asset shares from `owner`/`possessor` to `newOwnerAndPossessor`. Returns the number of transferred shares. |
| `numberOfPossessedShares(assetName: uint64, issuer: id, owner: id, possessor: id, ownershipManagingContractIndex: uint32, possessionManagingContractIndex: uint32)` | Returns the number of possessed shares matching all specified criteria. |
| `numberOfShares(assetName: uint64, issuer: id)` | Returns the total number of issued shares for the given asset. |
| `isAssetIssued(issuer: id, assetName: uint64)` | Returns `1` if the asset has been issued by the given issuer, `0` otherwise. |
| `acquireShares(assetName: uint64, issuer: id, owner: id, possessor: id, numberOfShares: sint64, acquirerContractIndex: uint32)` | Acquires shares into the contract. Returns the number of shares acquired, or a negative value on error. |
| `releaseShares(assetName: uint64, issuer: id, owner: id, possessor: id, numberOfShares: sint64, releaserContractIndex: uint32)` | Releases shares from the contract. Returns the number of shares released, or a negative value on error. |
| `bidInIPO(ipoContractIndex: uint32, price: sint64, quantity: uint32)` | Places an IPO bid. Returns the bid index or a negative value on error. |
| `ipoBidId(ipoContractIndex: uint32, ipoBidIndex: uint32)` | Returns the `id` of the bidder at the given IPO bid index. |
| `ipoBidPrice(ipoContractIndex: uint32, ipoBidIndex: uint32)` | Returns the bid price at the given IPO bid index. |

### QPI Types

Common types used in QPI contracts:

| Type | Description |
|---|---|
| `Array<T, L>` | Fixed-size array — use instead of C++ arrays |
| `HashMap<K, V, L>` | Hash map with key K, value V, capacity L |
| `HashSet<K, L>` | Hash set with key K, capacity L |
| `Collection<T, L>` | Ordered collection with capacity L |
| `ContractState<T, N>` | Persistent contract state storage |
| `Entity` | Spectrum entry (public key + balance info) |
| `Asset` | Asset descriptor (issuer id + asset name) |
| `DateAndTime` | Date/time struct returned by `qpi.now()` |
| `NoData` | Empty struct for procedures/functions with no I/O |
| `id` | 256-bit identity / address |
| `uint8` / `uint16` / `uint32` / `uint64` / `uint128` | Unsigned integer types |
| `sint8` / `sint16` / `sint32` / `sint64` | Signed integer types |
| `bit` | Single-bit boolean (0 or 1) |
| `m256i` | 256-bit value for digests and hashes |
| `Array typedefs` | `bit_2`…`bit_4096`, `sint8_2`…`sint64_8`, `uint8_2`…`uint64_8`, `id_2`/`id_4`/`id_8` |

### QPI Constants

Useful constants for QPI development:

| Constant | Value | Description |
|---|---|---|
| `NULL_ID` | `id::zero()` | The zero/null identity |
| `NULL_INDEX` | `-1` | Invalid / not-found index sentinel |
| `NUMBER_OF_COMPUTORS` | `676` | Total computors in the network |
| `QUORUM` | `451` | Minimum computors required for consensus |
| `INVALID_AMOUNT` | — | Sentinel for invalid QU amounts |
| `_A` – `_Z` | letter values | Used with `ID()` macro to build identities from letters |
| `JANUARY` – `DECEMBER` | `1`–`12` | Month constants |
| `MONDAY` – `SUNDAY` | — | Day-of-week constants |

---

## Screenshot

![Qubic QPI Language Support](images/screenshot.png)

---

## Requirements

- VS Code `^1.85.0`
- No runtime dependencies

## Building from Source

```bash
npm install
npm run compile
npm run package   # produces .vsix
```

Install the `.vsix` via *Extensions: Install from VSIX* in VS Code.

---

## Feature-Roadmap

### Phase 1 - MVP (this release)
- [x] Syntax Highlighting (QPI keywords, macros, types)
- [x] Code Snippets (PUBLIC_PROCEDURE, PUBLIC_FUNCTION, contract skeleton)
- [x] Linter: QPI language restrictions (`#`, `/`, `%`, pointers, native types, etc.)
- [x] "New Qubic SC" template command

### Phase 2 - Comfort
- [x] IntelliSense for all `qpi.*` functions
- [x] Hover documentation
- [x] Error squiggles (red underline for harder violations)
- [x] Full QPI type and constant completions (Array, HashMap, Entity, NULL_ID, etc.)

### Phase 2.5 - AI Agent Support
- [x] JSDoc-style contract metadata (`@contract`, `@description`, `@procedure`, `@function`, `@state`)
- [x] Hover documentation from doc-comment metadata
- [x] QPI017 — warning when `@procedure`/`@function` declared but missing from code
- [x] QPI018 — error when complex containers appear in the public interface (core v1.302.1)
- [x] `qpi-contract-doc` snippet

### Phase 3 - Power
- [ ] Dev Kit integration (deploy to testnet)

  > **Note for contributors:** This feature requires a stable Qubic CLI or REST API that allows contract developers to deploy `.h` files to the Qubic testnet directly from VS Code. As of 2026-03, no such public API exists for contract developers — [qubic-cli](https://github.com/qubic/qubic-cli) is targeted at node operators, not smart contract authors. If you know of an official deploy API or Dev Kit, please open an issue or contact the publisher.

- [x] Contract validator

## Marketplace

[Qubic QPI Language Support – VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AndyQus.qubic-org-qpi)

---

## Sources
- [QPI Documentation](https://docs.qubic.org/developers/qpi/)
- [Unofficial SC Guide](https://medium.com/@qsilver97/an-unofficial-guide-to-writing-qubic-smart-contracts-sc-774541a88610)
- [vscode-solidity as reference](https://github.com/juanfranblanco/vscode-solidity)

---

## Contributors

Thanks to everyone who has contributed code, fixes, and improvements to this extension.

- [@double-k-3033](https://github.com/double-k-3033) — Hardened smart contract detection
  (`QPI_CONTRACT_DECLARATION_REGEX`), split QPI001 into Warning/Error severity, and improved
  test harness accuracy. Thank you for the thorough and well-structured contributions!
