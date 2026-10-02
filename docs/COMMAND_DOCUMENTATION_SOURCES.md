# Command Documentation Sources

The documentation manifest in `data/command-documentation.js` records reviewed generator rules, not simulator executions. Its current scope is the help bundled with the installed **Cisco Packet Tracer 9.0.1**, checked on **2026-10-02**. Documentation from this installation is not evidence for Packet Tracer 6, 7 or 8.

## Review Method

- Read the installed Cisco HTML command trees with Python's standard-library `HTMLParser`, retaining configuration-mode headings and nested command branches, including implicitly closed list items.
- Compare each exact generator rule ID with the corresponding command chain and mode. A command name or broad prefix alone is insufficient evidence for omitted operands.
- Review the builder's restricted argument types, ranges and enum choices against those branches. Record narrower anchored command constraints where the source or adapter needs them.
- Record the SHA-256 of the installed source HTML. The public Cisco URLs below identify the same reference pages; their online contents can change independently of the installed copy.
- Bind approval to template revision `2.1.0`. Missing rules and variants outside a documented constraint do not acquire approval from other models or from runtime-test fixtures.

This is syntax documentation review. It does not prove successful execution, network behavior, correct topology, installed hardware, operating mode or active software-image prerequisites.

## Reviewed Sources

Each row has an individual manifest record scoped to Packet Tracer 9.0.1. The image name in the reference is an explicit prerequisite, not a claim that every image variant has identical support.

| Catalogue Component | Official Cisco Reference | Approved Rule IDs |
| --- | --- | ---: |
| `1841` | [1841_12.4.html](https://tutorials.ptnetacad.net/help/default/commandReference/1841_12.4.html) | 122 |
| `2811` | [2800_advip_15.1.html](https://tutorials.ptnetacad.net/help/default/commandReference/2800_advip_15.1.html) | 125 |
| `1941` | [1900_universal_base_15.1.html](https://tutorials.ptnetacad.net/help/default/commandReference/1900_universal_base_15.1.html) | 125 |
| `2901` | [2900_universal_base_15.1.html](https://tutorials.ptnetacad.net/help/default/commandReference/2900_universal_base_15.1.html) | 125 |
| `2911` | [2900_universal_base_15.1.html](https://tutorials.ptnetacad.net/help/default/commandReference/2900_universal_base_15.1.html) | 125 |
| `ISR4321` | [4300_universal_15.4.html](https://tutorials.ptnetacad.net/help/default/commandReference/4300_universal_15.4.html) | 125 |
| `ISR4331` | [4331_universal_16.6.4.html](https://tutorials.ptnetacad.net/help/default/commandReference/4331_universal_16.6.4.html) | 125 |
| `819` | [800_universal_base_15.4.html](https://tutorials.ptnetacad.net/help/default/commandReference/800_universal_base_15.4.html) | 127 |
| `829` | [829_universal_15.6.html](https://tutorials.ptnetacad.net/help/default/commandReference/829_universal_15.6.html) | 127 |
| `CGR1240` | [1240_universal_15.6.3.html](https://tutorials.ptnetacad.net/help/default/commandReference/1240_universal_15.6.3.html) | 129 |
| `Router-PT` | [CLI_routerIOS.htm](https://tutorials.ptnetacad.net/help/default/CLI_routerIOS.htm) | 78 |
| `C8200` | [8200_universal_security_17.6.3.html](https://tutorials.ptnetacad.net/help/default/commandReference/8200_universal_security_17.6.3.html) | 125 |
| `IR1101` | [ir1101_universalk9.17.10.01a.html](https://tutorials.ptnetacad.net/help/default/commandReference/ir1101_universalk9.17.10.01a.html) | 125 |
| `IR8340` | [8340_universalk9_17.8.1.html](https://tutorials.ptnetacad.net/help/default/commandReference/8340_universalk9_17.8.1.html) | 125 |
| `2950-24` | [2950_12.1_EA8.html](https://tutorials.ptnetacad.net/help/default/commandReference/2950_12.1_EA8.html) | 95 |
| `2950T-24` | [2950_12.1_EA8.html](https://tutorials.ptnetacad.net/help/default/commandReference/2950_12.1_EA8.html) | 95 |
| `2960-24TT` | [2960_15.0_SE4.html](https://tutorials.ptnetacad.net/help/default/commandReference/2960_15.0_SE4.html) | 97 |
| `Switch-PT` | [CLI_switchIOS.htm](https://tutorials.ptnetacad.net/help/default/CLI_switchIOS.htm) | 70 |
| `Switch-PT-Empty` | [CLI_switchIOS.htm](https://tutorials.ptnetacad.net/help/default/CLI_switchIOS.htm) | 70 |
| `IE-2000` | [2000_15.2_EY_enhancedlanbase.html](https://tutorials.ptnetacad.net/help/default/commandReference/2000_15.2_EY_enhancedlanbase.html) | 127 |
| `3560-24PS` | [3560_advip_12.2_46.html](https://tutorials.ptnetacad.net/help/default/commandReference/3560_advip_12.2_46.html) | 127 |
| `3650-24PS` | [3650_daneli_16.3.2.html](https://tutorials.ptnetacad.net/help/default/commandReference/3650_daneli_16.3.2.html) | 131 |
| `IE-3400` | [3x00_17.6.3_MD.html](https://tutorials.ptnetacad.net/help/default/commandReference/3x00_17.6.3_MD.html) | 131 |
| `ASA5505` | [5505_9.2.html](https://tutorials.ptnetacad.net/help/default/commandReference/5505_9.2.html) | 27 |
| `ASA5506-X` | [5506_9.6.html](https://tutorials.ptnetacad.net/help/default/commandReference/5506_9.6.html) | 27 |
| `ISA3000` | [ISA-3000-2C2F.html](https://tutorials.ptnetacad.net/help/default/commandReference/ISA-3000-2C2F.html) | 27 |

## Conservative Boundaries

- All 26 CLI adapters have documented `enable`, `configure terminal`, `hostname`, `end`, running-configuration and interface-summary commands. A minimal script does not imply that every control or every possible configuration is documented.
- Model-specific IOS trees often list entering a named extended ACL mode but omit its complete entry syntax. Those permit/deny variants remain unapproved from that source. The generic Router-PT reference has explicit extended ACL entry branches and is scoped only to that generic component.
- ASA extended ACL operand chains are marked `{OMITTED}`. ASA generated ACL entries remain unapproved. Their existence is not evidence for every protocol, address and port combination.
- ASA Network Objects references document object selection, subnet and dynamic-interface NAT, but omit the generated `exit` transition. The full generated object-NAT block remains unapproved until that transition has an applicable source.
- Model-specific router trees do not list the builder's dot1Q subinterface encapsulation branch. Those variants remain unapproved there; the generic Router-PT tree documents its own branch.
- Every currently reviewed image tree with an approved interface-PAT rule lists both numeric ACL identifiers and a named-ACL (`WORD`) branch under `ip nat inside source list ... interface ... [overload]` in Global Configuration Mode. This includes C8200. Both variants are documentation-backed; the builder still validates ACL definitions, references and interface roles.
- RSA sizes are limited to the reviewed image's modulus range. The 3560, 3650 and IE-3400 references cap the reviewed RSA branch at 2048, not 4096.
- The reviewed 3560 baseline is the non-dual image. IPv6 address/routing rules are not approved from the separate dual-stack tree. Its image and SDM requirements need their own review.
- Generic components use their generic command references. Branches absent there are not imported from a different physical model's reference.
- Interface identifiers stay model-specific. The 819 image documents single-index `FastEthernet0-3`, `GigabitEthernet0` and `Serial0`; the 829 image documents `GigabitEthernet0-6`. Those forms are not automatically approved for another model. The reviewed 2950/2960 and generic switch forms use two-index slot/port identifiers, not an extra third physical slot.
- CGR1240's source is internally inconsistent: its positive physical-interface branch uses slot/port identifiers, while its `show interfaces` branch uses single-index FastEthernet/GigabitEthernet identifiers. Combined cases requiring both forms remain blocked until an additional applicable positive reference reconciles them. Single-index `no interface` and `default interface` branches do not approve positive selection commands.
- Industrial diagnostics use the explicit image ranges: IE-2000 lists `FastEthernet1/1-8` and `GigabitEthernet1/1-2`; IE-3400 lists `GigabitEthernet1/1-10`. Family-only intermediate tree nodes are not treated as complete single-index command variants.
- Interface constraints deliberately describe a conservative command syntax envelope, not an inventory of actual device ports. Users must still confirm concrete interfaces, modules, switching/routed roles and ASA mode/license limits.

Exact simulator-tested cases, when genuine execution evidence becomes available, belong in the separate `data/command-verification.js` manifest. Documentation approval and runtime testing remain distinct statuses.
