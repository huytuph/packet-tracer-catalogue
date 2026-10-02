# Builder Coverage

This mapping covers the current 34 catalogue devices, 12 modules and 52 feature definitions. It distinguishes platform-specific CLI drafts, manual configuration worksheets, hardware prerequisites and unresolved command coverage. It does not enumerate every Packet Tracer command, promise a typed control for every option, or certify generated output in any release.

## Version context

The global Packet Tracer selector controls the catalogue and builder. A selected 6.x, 7.x, 8.x or 9.x family supplies only its scoped evidence. All versions is a combined planning/manual-worksheet context, not a verified CLI target. Availability, physical interfaces, capabilities and command syntax are separate claims. Documented inventory availability in 9.0.1 does not establish that a generated command was executed in that release.

CLI generation, copy and export require reviewed official command syntax for the selected model and documented release, not an exact runtime case for every hostname or IP address. Every emitted configuration/diagnostic rule and constrained variant must be covered; missing or unsupported variants block output. The installed 9.0.1 help supports only the recorded 9.x documentation context, not 6.x, 7.x or 8.x command claims. Manual worksheets and the parts list remain available independently.

The [command evidence contracts](COMMAND_VERIFICATION.md) distinguish Documentation-backed from Runtime-tested. Optional runtime evidence requires an exact case and one common tested release per major across models. Conflicting runtime releases suppress that label, not documentation-backed generation. There are currently no runtime-tested cases; a major label never implies certification of every minor release.

## Device mapping

CLI classifications identify the command dialect, not complete model-specific command support. Newer industrial and Catalyst platforms still need their own feature and release checks. Manual worksheets describe settings to apply in Packet Tracer; they are not IOS configurations.

| Device | Workflow | Important boundary |
| --- | --- | --- |
| 1841 | IOS router CLI | Switched ports require an installed EtherSwitch module. |
| 1941 | IOS router CLI | Confirm actual module slots and port names. |
| 2811 | IOS router CLI | Separate routed ports from EtherSwitch ports. |
| 2901 | IOS router CLI | Module and release support remain scoped. |
| 2911 | IOS router CLI | Module and release support remain scoped. |
| ISR4321 | IOS router CLI | NIM port names and roles require confirmation. |
| ISR4331 | IOS router CLI | NIM port names and roles require confirmation. |
| C8200 | IOS router CLI | Newer platform; generic IOS syntax is not full platform evidence. |
| 819 | IOS router CLI | Cellular/provider settings need separate evidence. |
| 829 | IOS router CLI | IOx and the embedded AP have separate command contexts. |
| CGR1240 | IOS router CLI | Industrial/cellular behavior is model-specific. |
| IR1101 | IOS router CLI | Newer industrial platform; confirm installed PIM and port roles. |
| IR8340 | IOS router CLI | Newer industrial platform; confirm installed PIM and port roles. |
| Router-PT | IOS router CLI | Generic modular device; do not assume physical Cisco module names. |
| 2950-24 | Layer 2 IOS switch CLI | No routed physical ports or IP-routing template. |
| 2950T-24 | Layer 2 IOS switch CLI | No routed physical ports or IP-routing template. |
| 2960-24TT | Layer 2 IOS switch CLI | Management SVI differs from routed interfaces. |
| 3560-24PS | Layer 3 IOS switch CLI | Routing enablement and switched/routed port modes are separate. |
| 3650-24PS | Layer 3 IOS switch CLI | Do not copy every 3560-specific command. |
| IE-2000 | Industrial IOS switch CLI | License-dependent and industrial features need scoped checks. |
| IE-3400 | Industrial IOS switch CLI | Newer platform; do not inherit all IE-2000 features. |
| Switch-PT | Layer 2 IOS switch CLI | Generic switch behavior is simulator-specific. |
| Switch-PT-Empty | Layer 2 IOS switch CLI | Install modules and establish actual ports first. |
| ASA5505 | ASA CLI | VLAN interfaces and physical switchports have different roles. |
| ASA5506-X | ASA CLI | Routed interfaces differ from ASA5505; FirePOWER is not simulated. |
| ISA3000 | ASA-family CLI | Industrial firewall syntax/limitations need dedicated checks. |
| AccessPoint-PT | Manual Config-tab worksheet | Local SSID, radio and Ethernet settings. |
| LAP-PT | Manual AP/controller worksheet | Wireless operation is controlled by a WLC. |
| 3702i | Manual AP/controller worksheet | WLC association plus limited local interface settings. |
| WLC-2504 | Manual WLC/web worksheet | WLAN, AP-group, DHCP and management settings. |
| WLC-3504 | Manual WLC/web worksheet | Check this model; 2504 documentation is not exhaustive evidence. |
| MX65W | Manual Meraki/web worksheet | Web-managed appliance, not ASA or IOS syntax. |
| HomeRouter | Manual home-router worksheet | WAN/LAN and radio/guest settings, not IOS commands. |
| Cloud-PT | Manual WAN-cloud worksheet | Config-tab DLCI/LMI and DSL/cable connection mappings. |

## Module mapping

Module selection is a planning prerequisite, not installation. Exact compatibility, quantity limits and interface names come from the selected context and installed device. The catalogue is not a complete inventory of all Packet Tracer modules.

| Module | Configuration context |
| --- | --- |
| HWIC-2T | Host router serial ports; encapsulation and DCE clocking only on the appropriate port. |
| WIC-1T | Host router serial port. |
| WIC-2T | Host router serial ports. |
| NIM-2T | Host ISR serial ports; confirm slot-derived names. |
| HWIC-4ESW | Host router switching ports; existing VLANs and separate Layer 3 roles. |
| WIC-1ENET | Host router Ethernet port. |
| NM-1FE-TX | Host router FastEthernet port. |
| HWIC-1GE-SFP | Host Gigabit/SFP interface and a compatible transceiver. |
| GLC-T | Physical copper transceiver; configure the host interface. |
| GLC-LH-SMD | Physical fibre transceiver; configure the host interface. |
| P-LTEA18-GL | Host cellular interface plus provider/radio prerequisites; no universal IOS script. |
| P-5GS6-GL | Host cellular interface plus provider/radio prerequisites; version-specific 5G context. |

NIM-ES2-4, NM-ESW-161 and generic PT module families appear in Cisco help but are not among these 12 bundled module entries. Recognizing a module family in a template is not a claim that the catalogue contains or verifies every such module.

## Feature mapping

These dispositions describe the appropriate configuration family. The typed forms cover selected options within those families; command variants not represented by a form remain outside the generator. A documented family is not automatically supported on every model or in every version. Unknown coverage must stay visible instead of becoming an invented command or an unsupported finding.

| Feature definitions | Disposition |
| --- | --- |
| `static_routing`, `default_route` | CLI route templates on eligible routing platforms. |
| `ipv6_routing` | IOS IPv6 addressing/routing family; model and release constraints apply. |
| `rip`, `eigrp`, `ospf`, `bgp` | Typed IOS IPv4 routing-process options; protocol variants/options are not all covered. |
| `ospfv3` | Documented IOS IPv6 routing family, currently reference-only rather than a typed process template. |
| `inter_vlan`, `routed_ports`, `svi` | Platform-specific router subinterfaces, routed ports and SVIs. Layer 2 management is distinct from routing. |
| `vlan`, `dot1q_trunk`, `voice_vlan` | Switching CLI family; router module VLAN prerequisites differ. |
| `stp`, `rstp` | Switch spanning-tree family; topology and port roles must be checked. |
| `etherchannel`, `lacp`, `pagp` | Switch link-aggregation family; member configurations must agree. |
| `port_security` | Switch security family; do not apply indiscriminately to every port mode. |
| `acl_standard`, `acl_extended` | IOS/ASA-specific access-list families with different syntax and attachment rules. |
| `nat`, `pat` | IOS/ASA-specific translation families; GUI platforms use manual settings. |
| `dhcp_server`, `dhcp_relay` | CLI service/helper family where supported; GUI platforms use worksheets. |
| `hsrp` | IOS first-hop redundancy family on eligible routed interfaces/SVIs. |
| `hdlc`, `ppp` | Typed serial encapsulation options; correct installed ports and peer configuration are required. Authentication variants are not all covered. |
| `frame_relay`, `pppoe` | Documented WAN families, currently reference-only for IOS. Cloud/home/Meraki workflows use manual settings. |
| `serial_wan` | Hardware/port prerequisite plus host WAN configuration, not a standalone command. |
| `stateful_firewall`, `vpn` | Reference-only beyond typed ACL/NAT options; no full inspection or VPN template. Meraki/ISA require their own modeled boundaries. |
| `rep`, `ptp` | Industrial command/reference families, not typed templates; scoped documentation, license and platform checks are required. |
| `cellular_3g4g`, `cellular_5g` | Hardware/provider/interface planning; not a generic command toggle. |
| `capwap`, `wpa2`, `wireless_ap`, `wireless_controller`, `dhcp_proxy`, `web_gui` | AP/WLC/home/Meraki manual configuration families; not universally IOS commands. |
| `poe`, `industrial_ot` | Physical capability/domain context; not a universal configuration switch. |
| `lldp`, `span` | Model-specific command references exist, but no typed template or blanket release support claim. |
| `glbp`, `vrrp`, `wpa3` | Command coverage unresolved by the reviewed primary trees. Missing evidence does not prove absence; no blanket template claim. |
| `firepower` | Existing ASA5506-X evidence records this as unsupported; do not generate FirePOWER configuration. |

`glbp`, `vrrp` and `wpa3` are defined catalogue features with no current device-support rows. Their presence in the feature dictionary does not establish support on a device.

## Sources and limits

The following are official Cisco/Cisco Networking Academy Packet Tracer help pages. They document a simplified simulator, not the complete real-device software. The current online help is not a release-by-release command matrix for 6/7/8/9; consult the catalogue's scoped evidence and test the exact installed release separately.

- [Router IOS command tree](https://tutorials.ptnetacad.net/help/default/CLI_routerIOS.htm)
- [Router IOS 15 command tree](https://tutorials.ptnetacad.net/help/default/CLI_routerIOS15.htm)
- [Switch IOS command tree](https://tutorials.ptnetacad.net/help/default/CLI_switchIOS.htm)
- [ASA command tree](https://tutorials.ptnetacad.net/help/default/CLI_asa.htm)
- [829 IOS/IOx and AP contexts](https://tutorials.ptnetacad.net/help/default/CLI_router829.htm)
- [Router modules](https://tutorials.ptnetacad.net/help/default/devicesAndModules_routers.htm)
- [IE-2000 configuration and licensing](https://tutorials.ptnetacad.net/help/default/config_IE2000.htm)
- [Industrial 3x00 command reference](https://tutorials.ptnetacad.net/help/default/commandReference/3x00_17.6.3_MD.html)
- [IR1101 command reference](https://tutorials.ptnetacad.net/help/default/commandReference/ir1101_universalk9.17.10.01a.html)
- [ISA3000 command reference](https://tutorials.ptnetacad.net/help/default/commandReference/ISA-3000-2C2F.html)
- [ISA configuration and modeling limits](https://tutorials.ptnetacad.net/help/default/config_isa.htm)
- [AP and lightweight AP settings](https://tutorials.ptnetacad.net/help/default/config_others.htm)
- [WLC settings](https://tutorials.ptnetacad.net/help/default/config_WLCs.htm)
- [Meraki web configuration](https://tutorials.ptnetacad.net/help/default/config_MerakiDevices.htm)
- [Home router settings](https://tutorials.ptnetacad.net/help/default/config_HomeRouter.htm)
- [WAN-cloud settings](https://tutorials.ptnetacad.net/help/default/config_clouds.htm)

Image versions in command-reference URLs identify simulated device software, not the global Packet Tracer version family. The primary help contains some legacy model references and inconsistent example spellings. Do not copy a command blindly or infer modern-model support from a family page. Generator and DOM-stub tests validate application behavior, not Packet Tracer execution or browser geometry.

Credential secrets and manual worksheet values are excluded from persisted drafts, but generated output, clipboard copies and exports can contain them in plaintext. There is no automatic simulator or remote deployment. CLI `.txt` and `.cfg` are complete command scripts beginning with `enable` and `configure terminal` and ending with `end`, not startup-configuration imports. Verification metadata and diagnostic commands remain separate from the script. Manual worksheets are `.txt`; neither output creates a `.pkt` topology.

## Runtime-verification workflow

This is a proposed testing workflow, not a working or executed Packet Tracer harness. At the current audit only Packet Tracer 9.0.1 is installed locally; no 6.x, 7.x or 8.x command execution is established. The user must open Packet Tracer, sign in and approve script privileges if required; these authentication and security approvals are not automated.

Cisco documents Script Modules and IPC APIs that can submit CLI commands and capture results. The online API reference is labeled 8.1.0, so probe the installed release's bindings before relying on them.

1. Define the scope as every command variant emitted by the builder, including diagnostics. The 52 feature definitions are not a complete command inventory. A finite successful test does not verify every possible argument or every command in Packet Tracer's full trees.
2. Use a disposable topology with dummy credentials. Record the exact Packet Tracer release/build, simulated image, model, installed modules/slots, port names/roles, command mode and prerequisites. Do not modify a user's existing network.
3. For an IPC-based runner, register terminal result/output events before submitting the ordered commands. `CiscoDevice.getIpcTerminalLine()` exposes a terminal; `TerminalLine.enterCommand()` submits a command. Capture `commandEnded` status and `outputWritten` output, including interactive prompts and timeouts.
4. Classify parser results separately: status 0 means accepted, while 1/2/3/4 indicate ambiguous, invalid, incomplete or not implemented. Missing events, permission failures, unavailable fixtures and timeouts remain blocked/unknown, not successful runs or proof that a feature is unsupported.
5. Assert expected configuration using captured diagnostic output and read-only state queries, then test relevant network behavior. Parser acceptance alone does not prove that routing, ACLs, NAT, DHCP or redundancy work. Direct IPC setters such as `setHostName()` or `setIpSubnetMask()` bypass CLI parsing and cannot verify a generated command.
6. Retain a transcript with dummy values and its SHA-256 hash with ordered command/diagnostic variants and explicit state assertions. Do not redact away the exact tested command parameters; do not use real secrets in fixtures. Bind evidence to the generator revision, model, release, output format, selected modules and prerequisites. Changes to those inputs require matching evidence or a new run.
7. Keep documentation support, parser acceptance, configuration-state assertions and operational tests as separate claims. Publish a runtime result only after the actual simulator run; Node/DOM fixtures, copied command references and invented transcripts are not runtime evidence. A schema validator and hash check validate record consistency, not the authenticity of an execution claim.

Official automation references:

- [Script Module architecture](https://tutorials.ptnetacad.net/help/default/scriptModules.htm)
- [Scripting interface and required privileges](https://tutorials.ptnetacad.net/help/default/scriptModules_scriptingInterface.htm)
- [Script engine IPC access](https://tutorials.ptnetacad.net/help/default/scriptModules_scriptEngine.htm)
- [CiscoDevice terminal access](https://tutorials.ptnetacad.net/help/default/IpcAPI/class_cisco_device.html)
- [TerminalLine command submission, status and output events](https://tutorials.ptnetacad.net/help/default/IpcAPI/class_terminal_line.html)
- [CommandLogEntry metadata](https://tutorials.ptnetacad.net/help/default/IpcAPI/class_command_log_entry.html)

The command log records entered/resolved commands but does not itself establish successful parser or operational results. External IPC applications also require connection and privilege setup; no headless runner or successful automated execution is established here.
