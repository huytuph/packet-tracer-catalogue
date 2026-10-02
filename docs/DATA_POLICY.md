# Catalogue Data Policy

## Scope

The catalogue covers **Cisco Packet Tracer Network Devices** and network-device expansion modules that materially help with Packet Tracer builds.

It is not intended to be a general Cisco product database or an exhaustive catalogue of Packet Tracer PCs, printers, IoT endpoints, consumer electronics, or unrelated end devices.

## Matching authority

For build recommendations and requirement matching, evidence is interpreted in this order:

1. Packet Tracer behaviour verified in the target/current Packet Tracer version.
2. Cisco / Cisco Networking Academy Packet Tracer documentation.
3. Cisco technical documentation where it accurately maps to the simulated feature.
4. High-quality Packet Tracer-specific community evidence.

When real Cisco hardware and Packet Tracer differ, **Packet Tracer behaviour wins for matching**. The difference should be recorded as a limitation or evidence note.

## Version availability

The global selector uses Packet Tracer major-version families 6, 7, 8 and 9, plus a combined All versions view. The maintained evidence file records every device/family pair explicitly.

| Availability | Meaning |
| --- | --- |
| `true` | Evidence records the device as available within the stated version context. |
| `false` | Evidence supports absence or unavailability within the stated version context. |
| `null` | Availability is unverified; this is not evidence of absence. |

A family record summarizes the available evidence, not a guarantee for every minor release. Keep an exact observation's release in `observed_release` and describe its limits in the notes. A device newly documented in one version must not be assigned to older versions without evidence.

Known facts require a cited source and a verification status. Evidence is identified as documentation, observation or inference; inferred conclusions remain Partial. Unverified availability remains Unknown.

## Technical version scope

Availability verification and technical verification are separate claims. Knowing that a device appears in PT 8 does not verify its ports, IOS commands, features or modules in that release. A device-level Verified label does not upgrade its individual capability records.

Interfaces, feature support, module compatibility and limitations retain their recorded version scope. A selected major version uses only that family's evidence and version-neutral supporting context. Real-hardware interfaces remain Partial context and do not establish Packet Tracer support. All versions combines recorded claims from different releases; it does not turn them into proof for a single release.

Older families may have documented availability while their technical profiles remain Unknown or Partial. Keep that distinction visible when matching requirements.

The UI keeps devices with Unknown availability visible, but suppresses their technical claims and general descriptive build guidance for the selected family. A missing technical profile is not a zero-port or unsupported-feature finding.

## Capability states

Device feature support uses these explicit states:

| State | Meaning |
| --- | --- |
| `native` | Available without a module; ordinary feature use may still require configuration. |
| `configuration_required` | Supported by the device but requires relevant Packet Tracer/IOS configuration. |
| `module_required` | Hardware/interface capability requires a compatible expansion module. |
| `module_and_configuration` | Requires both expansion hardware and configuration. |
| `unsupported` | Verified unsupported for the represented Packet Tracer context. |
| `unknown` | Not sufficiently verified. Never treated as supported. |

## Verification status

Rows and devices can be marked `Verified`, `Partial`, or `Unknown`.

- **Verified**: supported by strong evidence for the recorded claim.
- **Partial**: useful evidence exists, but version/feature coverage is incomplete.
- **Unknown**: no adequate evidence yet.

The catalogue prefers an explicit unknown over an inferred capability.

## Sources

Sources carry a tier:

1. Official Cisco / Cisco Networking Academy documentation and Cisco-authored Packet Tracer help. Archived mirrors must disclose their provenance.
2. Cisco Community discussions and firsthand simulator reports; these are user-generated evidence, not official support declarations.
3. Specialist Packet Tracer references, such as PacketTracerNetwork.com.
4. Other community references, API-derived compatibility lists and live-probe projects, such as PTBuilder, MCP Packet Tracer and Network Engineering Stack Exchange.

A lower tier is not automatically wrong; it signals that the claim should be verified against stronger evidence when practical.

## Third-party material

The catalogue records source links, factual summaries and original evidence notes. External documentation, software and trademarks remain subject to their owners' rights and terms; the project's MIT license does not relicense them. Preserve attribution and do not treat a citation as permission to copy or redistribute the source material.

## Connection guidance

Cable suggestions are conventional Packet Tracer networking guidance. Auto-MDIX and simulation-version behaviour may allow an alternate copper cable in some cases. Connection results should therefore be read together with their notes.

## Generated CLI guidance

The builder uses the global Packet Tracer version selector throughout; there are no independent builder or device-release selectors. A selected family uses that family's availability and technical evidence. All versions remains a combined planning and manual-worksheet context, not a target for verified CLI generation. Device availability, capability verification and command-template verification remain separate claims.

Every bundled device is mapped to a CLI platform or a manual configuration worksheet, and every module and feature has a recorded coverage disposition. See [Builder coverage](BUILDER_COVERAGE.md). This mapping is not a claim that every command or option in Packet Tracer has a typed generator control. GUI-managed devices receive worksheets, not invented IOS commands; modules use their host's actual ports and configuration context, not universal module scripts.

Documented availability in a 9.0.1 inventory does not mean that commands were executed in 9.0.1. Command references support a documentation claim only. A passing generator or UI test checks application behavior, not simulator acceptance.

CLI generation and export require matching runtime-verification records for the exact recorded release, device model and ordered command variants, including a captured transcript and prerequisites. Unknown, missing or documentation-only command evidence cannot authorize CLI output. There are currently no runtime-verified command records. A test in one release does not certify every minor release in its major family, nor every configuration or topology supplied by a user.

The [command evidence manifest](COMMAND_VERIFICATION.md) permits only one common tested exact release per major across all models; conflicting releases make that global context ambiguous and block CLI output. Transcript hashes and schema checks establish record consistency, not execution authenticity. Genuine simulator execution and state assertions require review; synthetic application-test fixtures are never runtime evidence.

Selected devices and modules form a planning list. Selection does not install physical modules, establish module interface names, cable a topology or send commands to Packet Tracer. When verification permits them, CLI `.txt` and `.cfg` exports are complete command scripts: `enable`, `configure terminal`, generated commands line by line, then `end`. Evidence stays in verification metadata rather than script headers; diagnostic commands remain separate. These scripts are not startup-configuration imports. Manual worksheets remain available as non-executable `.txt` even when `.cfg` is requested; they are not runtime-verified configurations. Neither export is a `.pkt` topology file.

## Local selection data

When available, browser `localStorage` retains the version preference, selected devices/parts and configuration drafts. The app does not upload this data; clipboard copying and file exports occur only through user actions. Clearing the selection overwrites the saved selection with an empty list. If storage is unavailable or saving fails, the current session remains usable.

Credential secrets and manual worksheet values are retained only in the current session and excluded from saved drafts and restoration. Generated commands or worksheets, clipboard copies and downloaded files can contain those values in plaintext; treat them as sensitive. The app does not deploy commands to Packet Tracer or remote devices.
