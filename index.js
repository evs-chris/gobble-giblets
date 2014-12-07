module.exports = giblets;

var sander = require('sander'),
    Promise = sander.Promise,
    request = require('request-promise'),
    path = require('path');

function giblets(input, output, opts) {
  var env = opts.environment || opts.env || 'development';
  var adapt = 'adapt' in opts ? opts.adapt : true;
  var cacheDir = opts.cacheDir || path.resolve(process.cwd(), '.giblets');

  return sander.readFile(input, 'giblets.json').then(toJSON).then(function(json) {
    var deps = json[env] || {},
        results = [];

    // process giblethub
    results.push(processGibletHub(deps.giblethub || [], { base: output, adapt: adapt, cacheDir: cacheDir }));

    // process components
    results.push(processComponents(deps.component || {}, { base: output, cacheDir: cacheDir }));

    return Promise.all(results);
  });
}

function cache(details, src, dest, cacheDir, write) {
  if (!dest) dest = src;

  var cached = path.resolve(cacheDir, details.name, details.version, dest),
      ghf = 'https://raw.githubusercontent.com/' + details.repo + '/' + details.version + '/' + details.path + src;

  // return the cached file, if it's there
  return sander.readFile(cached).then(
    function(data) {
      if (write) return sander.writeFile(write, data).then(function() { return data; });
      else return data;
    },function() { // otherwise fetch it
      return request(ghf).then(function(data) {
        return sander.writeFile(cached, data).then(function() { // and cache it
          // and write it out if requested
          if (write) return sander.writeFile(write, data).then(function() { return data; });
          else return data;
        });
      });
    }
  );
}

function processGibletHub(gh, opts) {
  var results = [],
      version, repo, name, path = '', details;

  function gibletFile(obj, dest) {
    dest.name = dest.name || obj.name;
    dest.repo = obj.repo;
    dest.path = obj.path;
    dest.version = obj.version;
    dest.base = opts.base;
    dest.adapt = 'adapt' in dest ? dest.adapt : ('adapt' in obj ? obj.adapt : opts.adapt);
    return dest;
  }

  for (var i = 0; i < gh.length && (giblet = gh[i]); i++) {
    // for repos with a giblet.json: '[&]user/repo[/path]@version'
    if (typeof giblet === 'string') {
      giblet = giblet.split('@');
      repo = giblet[0].split('/');
      version = giblet[1];
      details = {};

      if (repo[0][0] === '&') {
        adapt = false;
        repo[0] = repo[0].slice(1);
      }
    }

    // object description { repo, version, [ scripts, styles, files ] }
    else {
      repo = giblet.repo.split('/');
      version = giblet.version;
      details = giblet;
    }

    // module name if not already provided
    name = details.name || repo[1];

    if (repo.length > 2) path = repo.slice(2).join('/');
    repo = repo[0] + '/' + repo[1];

    details.adapt = opts.adapt, details.base = opts.output, details.name = name, details.repo = repo, details.version = version, details.path = path;

    // manual definition
    if (details && (details.scripts || details.styles || details.files)) {
      results.push(processGiblethub(details, opts.cacheDir));
    }

    // grab the giblet.json
    else {
      (function(details) {
        results.push(cache(details, 'giblet.json', null, opts.cacheDir)
          .then(toJSON)
          .then(function(obj) { return gibletFile(obj, details); })
          .then(function(details) { return processGithub(details, opts.cacheDir); })
        );
      })(details);
    }
  }

  return Promise.all(results);
}

var validComponentVersion = /^[-0-9a-z\._]+$/i;
function processComponents(components, opts) {
  var results = [], repo, version, details;

  for (repo in components) {
    version = components[repo];

    if (!validComponentVersion.test(version)) {
      results.push(Promise.reject(new Error("Giblets doesn't support this type of version string for components yet: " + version + " for " + repo + ".")));
      break;
    }

    details = {
      name: repo.split('/')[1],
      repo: repo,
      version: version,
      path: '',
      adapt: true,
      type: 'cjs',
      base: opts.base
    };

    // grab the component.json
    (function(details) {
      results.push(cache(details, 'component.json', null, opts.cacheDir)
        .then(toJSON)
        .then(function(obj) {
          var version = details.version;
          details = copyProps(obj, details);
          details.version = version;
          details.name = obj.name || details.name;
          details.files = (details.files || [])
            .concat(details.fonts || [], details.images || []);
          details.scripts = details.scripts.map(function(f) { if (details.main === f) return { file: f, target: 'index.js' }; else return f; });
          return processGithub(details, opts.cacheDir);
        })
      );
    })(details);
  }

  return Promise.all(results);
}

var deCJSre = /var\s+([a-zA-Z\$_][a-zA-Z\$_0-9]*)\s+=\s+require\s*\((["'][^"']+["'])\)\s*;?/g;
function requireToImports(match, name, mod) {
  return 'import ' + name + ' from ' + mod + ';';
}

function deUMD(data) {
  return 'var module = { exports: {} };\n' + data + '\nexport default module.exports;';
}

function deCJS(data) {
  data = data.toString().replace(deCJSre, requireToImports);
  return 'var module = { exports: {} };\n' + data + '\nexport default module.exports;';
}

function processGithub(obj, cacheDir) {
  var i, j, part, file, src, dest, parts = [obj.scripts || [], obj.styles || [], obj.files || []];
  var results = [], result;

  for (j = 0; j < parts.length && (part = parts[j]); j++) {
    for (i = 0; i < part.length && (file = part[i]); i++) {
      if (typeof file === 'object') src = file.file, dest = file.target;
      else src = file, dest = file;

      result = cache(obj, src, dest, cacheDir);

      // for js (scripts), work with whatever modules are already there
      if (obj.adapt && j === 0) {
        if (obj.type === 'cjs') {
          result = result.then(deCJS);
        } else if (obj.type === 'umd') {
          result = result.then(deUMD);
        }
      }

      results.push(result.then(writeTo(path.resolve(obj.base, obj.name, dest))));
    }
  }

  return Promise.all(results);
}

function writeTo(file) {
  return function(data) {
    return sander.writeFile(file, data);
  };
}

function toJSON(data) { return JSON.parse(data); }

function clone(obj) { return copyProps(obj, {}); }
function copyProps(src, dest) {
  for (var k in src) {
    dest[k] = src[k];
  }
  return dest;
}
