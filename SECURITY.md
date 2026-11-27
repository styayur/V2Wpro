# Security

WorldIR 2.0 accepts six declarative operators. Schema and semantic validation reject unknown operators, recursive references, unsafe expansion sizes, invalid numbers and unknown evidence or asset bindings. Local decoding uses bounded files and timeouts. Keep FFmpeg, Blender and Chromium patched. See the [compiler limits](docs/compiler.md) and [execution bounds](docs/morphogenesis.md).

Report suspected security issues privately to the repository owner through GitHub private vulnerability reporting when available. Include the affected version, platform and observed impact. Omit credentials and private footage.

Use maintained FFmpeg, Blender and browser builds. Run media conversion on trusted input in a restricted local workspace. The preview server listens on loopback. Camera captures and source copies stay in the local workspace unless you choose to publish them. Review third-party glTF resource URIs before import. The CLI does not run provider-generated code.
