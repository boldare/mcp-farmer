# Changelog

## [1.3.0](https://github.com/boldare/mcp-farmer/compare/v1.2.0...v1.3.0) (2026-01-21)


### Features

* add check for description quality ([bd51dbe](https://github.com/boldare/mcp-farmer/commit/bd51dbe94e095ca1d980cbc1b174defe6f6655bf))
* add doc command ([3a1270a](https://github.com/boldare/mcp-farmer/commit/3a1270ace33cd412460c9f847d51e6bf8bf1a1e3))
* add eval command for autonomous MCP server tool evaluation ([#6](https://github.com/boldare/mcp-farmer/issues/6)) ([a0d1a1f](https://github.com/boldare/mcp-farmer/commit/a0d1a1f2338a4ff2ed0b823a984f53acf2230666))
* add grow command with option to add tools from OpenAPI specification using ACP ([#5](https://github.com/boldare/mcp-farmer/issues/5)) ([a2935a4](https://github.com/boldare/mcp-farmer/commit/a2935a49c44904e81319c5e0e4c5b6e08fc9e2b4))
* add logs for grow command ([5598c24](https://github.com/boldare/mcp-farmer/commit/5598c248a4f80b019b06402ff7350beacd5247ed))
* add markdown option to grow command ([#7](https://github.com/boldare/mcp-farmer/issues/7)) ([745999a](https://github.com/boldare/mcp-farmer/commit/745999a07c48f44d40b3607acf717ec1495db2cd))
* add markdown output for vet command ([a36e250](https://github.com/boldare/mcp-farmer/commit/a36e250bcc0e8bdc69389b70665a6ae2436aac1c))
* add netlify deploy template option ([6a3bcf1](https://github.com/boldare/mcp-farmer/commit/6a3bcf1cfe4f631481fd616a82a8a34b66819729))
* add passthrough for ouput schema to fix under documented endpoints ([0bcc360](https://github.com/boldare/mcp-farmer/commit/0bcc360437157251718b53ddda1fd68ec87d25be))
* add prompts for user to use other commands ([9b57a60](https://github.com/boldare/mcp-farmer/commit/9b57a60f8cd7a83605b2332587926619d82e6ee5))
* add ux improvements to generated docs ([1b7f0d9](https://github.com/boldare/mcp-farmer/commit/1b7f0d98f26a043b7a56e231e50ab1e73f9e6899))
* allow using serach for models in acp ([b40bb23](https://github.com/boldare/mcp-farmer/commit/b40bb23d63b5858bfb7984f4cfbe1925a2e74b1f))
* check if tool has annotation ([04ef256](https://github.com/boldare/mcp-farmer/commit/04ef25667243bf7c2001b2b6a86b4c4f2cbe8b76))
* display more context for openapi grow ([b87ef7b](https://github.com/boldare/mcp-farmer/commit/b87ef7b12c3ddba4b88caf8e57a33be9cc26feea))
* improve grow prompts ([64480ab](https://github.com/boldare/mcp-farmer/commit/64480abbd98a1185cbff54a537c5f5ebe1619834))
* improve robustness of the commands ([9802b68](https://github.com/boldare/mcp-farmer/commit/9802b68f95de3e8a054a59ac52d9d55599947cb7))
* improve spinner info while eval command runs ([add3689](https://github.com/boldare/mcp-farmer/commit/add368984cf5276a5bbd109e446f4b20c2c4041b))
* make the code more robust and allow accepting more http input target ([2bffbfb](https://github.com/boldare/mcp-farmer/commit/2bffbfba4acd3fcb896bc98caea9f77b8756c366))
* rename eval to probe to better fit the actual logic ([e8f9546](https://github.com/boldare/mcp-farmer/commit/e8f95461e973d83a1334d410991a80eab936b12d))
* select model for grow command via acp ([da9e253](https://github.com/boldare/mcp-farmer/commit/da9e253245ccd3a21122a0c1c82b8f6c8ada4c43))
* showcase more progress during grow command ([7828f80](https://github.com/boldare/mcp-farmer/commit/7828f80feb4d3616a0df01278e19ecc30a0cfb87))
* showcase more progress during probe command ([4d8f2d3](https://github.com/boldare/mcp-farmer/commit/4d8f2d39b5b019167c1945503b52f9b038d44aba))
* simplify new server type flag ([e820d34](https://github.com/boldare/mcp-farmer/commit/e820d34434bbc17f6a84bfe19eb4cebf27306e45))
* simplify try command and add prompt item ([c1dcdb4](https://github.com/boldare/mcp-farmer/commit/c1dcdb4b399011304e6b77cbdcb0b30c139d3315))
* simplify visual output ([4ac0a3b](https://github.com/boldare/mcp-farmer/commit/4ac0a3b785ee641c543e8fc76ee1a285adcc9a65))
* support gemini cli in market command ([54566e0](https://github.com/boldare/mcp-farmer/commit/54566e008f58610e59f8729d73e81f6f91e45ccf))
* support github copilot cli in grow command ([408e6eb](https://github.com/boldare/mcp-farmer/commit/408e6ebf7602c7908cdd1ca0f2254339310b530f))
* support graphql in grow command ([2f3e272](https://github.com/boldare/mcp-farmer/commit/2f3e272574cbcf9ec821a783578ac2059ee9116a))
* use heading for markdown report ([83aa78e](https://github.com/boldare/mcp-farmer/commit/83aa78eed91201a786b2cbf3f4b01a335d125ec7))
* vet mcp servers from config files ([0b6fe0d](https://github.com/boldare/mcp-farmer/commit/0b6fe0d3ee2f3967ba6ede5ca77617e3195fcbd4))


### Bug Fixes

* close commands after success ([7a1b802](https://github.com/boldare/mcp-farmer/commit/7a1b802d2917c7a75d9be46351d919c5fc6ea1d4))
* increase inquirer select prompt calls ([93511bb](https://github.com/boldare/mcp-farmer/commit/93511bb6065c06396ae3357780b66aee72b3a597))

## [1.2.0](https://github.com/boldare/mcp-farmer/compare/v1.1.0...v1.2.0) (2025-12-17)


### Features

* allow using new command with cli args ([b89cd2d](https://github.com/boldare/mcp-farmer/commit/b89cd2dcea03995a6c31f6118bd4dce519b9ff0f))
* create src directory for new mcp server ([e80bc01](https://github.com/boldare/mcp-farmer/commit/e80bc01fb44a06e8e8ad093ca799b74ffcb25cc4))
* don't run install script with new command ([f4513ec](https://github.com/boldare/mcp-farmer/commit/f4513ec52f024475642b2b29d03bf805ff6c08d2))
* generate simple agents file ([b62b865](https://github.com/boldare/mcp-farmer/commit/b62b8654c7b7118908caddd24c5fcf736af26bd0))
* improve generated mcp server code ([3ff71dd](https://github.com/boldare/mcp-farmer/commit/3ff71ddb54830927e9005522bbb3b9e789c3f252))
* improve handling of connection and network errors ([473b98c](https://github.com/boldare/mcp-farmer/commit/473b98caa653e10b59cad70fedb2cb7760d4e3b2))
* make the generated mcp server scripts more robust ([2c7b076](https://github.com/boldare/mcp-farmer/commit/2c7b07610dcd47c379f9ca13513c1a3fdeedad3f))

## [1.1.0](https://github.com/boldare/mcp-farmer/compare/v1.0.0...v1.1.0) (2025-12-16)


### Features

* add dockerfile output option to new command ([ec44fee](https://github.com/boldare/mcp-farmer/commit/ec44feeefea37c2d5470dd97ed306b574641f7d0))
* display annotations in vet command ([1dd4754](https://github.com/boldare/mcp-farmer/commit/1dd4754f994ff56bb7c92c101f4b2e2167f2ead0))

## 1.0.0 (2025-12-16)


### Features

* add 'new' command for scaffolding functionality ([379d98d](https://github.com/boldare/mcp-farmer/commit/379d98d89a6a1894d84a75317eb0c85707d4a06f))
* add health endpoint to template servers ([d0361bd](https://github.com/boldare/mcp-farmer/commit/d0361bd05e640bc9d089a97f261959d52a5bad53))
* add hono framework option ([52035a2](https://github.com/boldare/mcp-farmer/commit/52035a26480661fd4f406af87ea91803ba52d3f7))
* add html output for vet command ([489c8d8](https://github.com/boldare/mcp-farmer/commit/489c8d81901bbf27102794d72c6a44212c3691a1))
* add initial app ([f1c3e4c](https://github.com/boldare/mcp-farmer/commit/f1c3e4cc3bcf343b4bd2ad12b8e1a569fa6ff7c9))
* add market command ([3f4d9ab](https://github.com/boldare/mcp-farmer/commit/3f4d9abcd586b0ec343fb82c68ab2bc55d081c89))
* add readme and initialize git repository when creating new server ([b879c00](https://github.com/boldare/mcp-farmer/commit/b879c00d68ed1f46e294db9648c664197abc2685))
* add script to run the server or stdio ([74ef575](https://github.com/boldare/mcp-farmer/commit/74ef5751704f4cdf79ebbf8a1d54816602cc4571))
* add try command ([08c8142](https://github.com/boldare/mcp-farmer/commit/08c81424cd22ebbd096ca1689a5bc7fb0a9ef612))
* allow accessing oauth secured mcp via vet command ([15b552e](https://github.com/boldare/mcp-farmer/commit/15b552ec25ded94ce82ea7fee959bcda9f718cb9))
* allow user to select transport for new server ([67398a7](https://github.com/boldare/mcp-farmer/commit/67398a7f9cbfb9fc75927125ab314991f2423db4))
* check for similar tool descriptions ([9607067](https://github.com/boldare/mcp-farmer/commit/96070673c565fa907b3395ea9766d014db89c7b7))
* check if mcp server has too many tools ([f0bdbd1](https://github.com/boldare/mcp-farmer/commit/f0bdbd11208b1717559dad77f6930aa87be336e5))
* detect personal identifiable informations ([8495448](https://github.com/boldare/mcp-farmer/commit/8495448e4ddad57e6795857c8bc71f37cffbdbd8))
* handle authentication error ([38fc86f](https://github.com/boldare/mcp-farmer/commit/38fc86f283d8be3f5e0934ac04f060482a80bbad))
* print info if output is missing ([48d3390](https://github.com/boldare/mcp-farmer/commit/48d33905a036d385a3fc8c1d0c8ec5ab78f8129a))
* read resources in try command ([afa9cd6](https://github.com/boldare/mcp-farmer/commit/afa9cd629700818de6d0a72c828686a2e2378b99))
* show prompts and resources if supported ([8ab9af2](https://github.com/boldare/mcp-farmer/commit/8ab9af249f98c54fc5bed13b72753005a2489a5b))
* show tool outputs ([cf8e6b7](https://github.com/boldare/mcp-farmer/commit/cf8e6b7b068d20853938c83de6777590e4ef8b05))
* support claude desktop config on different platforms ([4f85455](https://github.com/boldare/mcp-farmer/commit/4f854554b73fc1ad6b7984d0dfc85a902ba601d1))
* support opencode and new mcp servers in market command ([399e194](https://github.com/boldare/mcp-farmer/commit/399e194532e16e6815fd424dd773083541035c61))
* support stdio transport for vet command ([6658a88](https://github.com/boldare/mcp-farmer/commit/6658a88c01321d20e3966bdc8a69f9a2a109ad50))


### Bug Fixes

* check all inputs for a tool for missing description ([e7a9b5f](https://github.com/boldare/mcp-farmer/commit/e7a9b5fcb98429362c89c10a62fe183712350bae))
