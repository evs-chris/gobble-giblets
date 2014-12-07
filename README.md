# gobble-giblets

Pull in dependencies with gobble.

## Installation

First, you need to have gobble installed - see the [gobble readme](https://github.com/gobblejs/gobble) for details. It also expects to be used with es6 modules, so [esperanto](https://github.com/Rich-Harris/esperanto), which also has gobble plugins, comes in handy.

Once you have gobble installed, it will take care of installing any referenced plugins, including the giblets plugin, for you.

## Usage

giblets expects to be run against a directory with a `giblets.json` file at the root. For now, it's recommended that you have a `giblets` directory in the root of your project. Then, you can add something like this to your gobblefile:

```js
var libs = gobble('giblets').transform('giblets');
```

### Options
* `environment` - alias `env` - defaults to `'development'` - which environment key to use in the configuration
* `adapt` - defaults to `true` - automatically turn `type`d dependencies into es6-style modules
* `cacheDir` - defaults to `process.cwd() + '/.giblets'` - the cache directory for downloaded files

## Configuration

The `giblets.json` file expects to have top-level keys for the environment (development, production, etc). Each environment object is expected to have keys for different providers. The only provider currently supported is `giblethub`, which is a sort of special form of GitHub reference. Within the provider, provider specific dependencies are specified.

### GibletHub

The `giblethub` provider makes use of the `.giblets` cache in the root of your project, where files are cached under their dependency name, version, and relative path. Once the files for a dependency version are cached, the cached versions will be used until they are manually deleted. If a file is requested that is not currently cached, it will be downloaded from the target repo using a `raw.githubusercontent.com` url and cached. `giblet.json` files are also stored in the cache.

`giblethub` should be an array of objects and/or strings.

#### Object-style
* target `repo` - e.g. `"ractivejs/ractive"`)
  The repo may also specify a path for a specific part of the repo e.g. `"some-magical/bootstrapthing/pieces/autocomplete"` refers to the `some-magical/bootstrapthing` repo under the `pieces/autocomplete` directory.
* `version` - the tag to pull from e.g. `"edge"` or `"0.6.1"`
* `name` - the name of the dependency, which defaults to the repo name
* `type` - what sort of module system the scripts use e.g. `"cjs"` for CommonJS or `"umd"` for UMD
  This is optional, and if left unspecified, the files will not be modified to use es6 modules.
* `scripts` - an array of filenames or objects with `file` and `target` keys, where `file` is the name of the file in the repo and `target` is the name of the file locally.
  Using `target` to rename a file is handy for things like Ractive where the deployed script name is `ractive.js`, but you may want to rename it to `index.js` to reference it using
  ```js
  import Ractive from 'ractive';
  // rather than
  import Ractive from 'ractive/ractive';
  ```
  `scripts` will also be adjusted to use es6 modules if the dependency has a `type` specified.
* `styles` - an array of filenames to retrieve
* `files` - an array of filenames to retrieve
* `adapt` - overrides the transform option

If there are no `files`, `scripts`, or `styles` specified, then giblets will look for a `giblet.json` in the repo for the details. If that's available already though, you may want to just go string-style.

#### String-style

If the repo you're targeting already supports giblets (not likely), then you can simply reference it with `"user/repo/path@version"` and giblets will pull the `giblet.json` and handle everything else from there. `path` is optional, as with object-style descriptors, but can be handy for libraries that have lots of independant related components.

### Component

giblets has very basic support for [components](https://github.com/componentjs/component). The `component` key for an environment should be provided in roughly the same way as the `dependencies` key in a `component.json` file. Semver versions are not supported at this time, so you have to specify an explicit version. Component dependencies are also not supported at this time, so you will have to add all of your dependencies dependencies to your `giblet.json` manually.

Components will automatically be processed to convert their `require`s into ES6 import statements. The main module will also be moved to `index.js` if it is something else, so that the component can be imported as `import component from 'component'`.

## Sample Configuration

```json
{
  "development": {
    "giblethub": [
      { "repo": "ractivejs/ractive", "version": "edge", "scripts": [ { "file": "ractive.js", "target": "index.js" } ], "type": "umd" },
      { "repo": "yahoo/pure/src", "version": "v0.5.0", "styles": [ "base/css/base.css", "grids/css/grids-core.css" ] },
      "some-magical/bootstrapthing/pieces/autocomplete@12.0.1919"
    ],
    "component": {
      "": ""
    }
  }
}
```

## TODO

If this project is useful/successful, here some things that it will probably be adjusted to handle:

* better component support
* dependency dependents
* resolution of version numbers using `semver`
* perhaps some sort of npm provider, to behave like a browserify that doesn't hate non-script files
* other providers
* style/asset processing of some sort? gobble may already have this covered

## License

Copyright (c) 2014 Chris Reeves. Released under an [MIT license](https://github.com/evs-chris/gobble-giblets/blob/master/LICENSE.md).
