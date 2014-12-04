module.exports = giblets;

var sander = require('sander'),
    Promise = sander.Promise,
    request = require('request-promise'),
    path = require('path');

function giblets(input, output, opts) {
  var env = opts.environment || opts.env || 'development';

  return sander.readFile(input, 'giblet.json').then(toJSON).then(function(json) {
    var deps = json[env] || {}, gh = deps.giblethub || [];
    var results = [];
    var version, repo, name, path = '', details;

    function gibletFile(obj, dest) {
      dest.name = obj.name;
      dest.repo = obj.repo;
      dest.path = obj.path;
      dest.version = obj.version;
      dest.base = output;
      return dest;
    }

    for (var i = 0; i < gh.length && (giblet = gh[i]); i++) {
      // for repos with a giblet.json: 'user/repo[/path]@version'
      if (typeof giblet === 'string') {
        version = giblet.split('@');
        repo = giblet[0].split('/');
        version = giblet[1];
        details = {};
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

      details.base = output, details.name = name, details.repo = repo, details.version = version, details.path = path;

      // manual definition
      if (details && (details.scripts || details.styles || details.files)) {
        results.push(processGiblethub(details));
      }

      // grab the giblet.json
      else {
        (function(details) { results.push(cache(details, 'giblet.json').then(toJSON).then(function(obj) { return gibletFile(obj, details); }).then(processGiblethub)); })(details);
      }
    }

    return Promise.all(results);
  });
}

function cache(details, src, dest, write) {
  if (!dest) dest = src;

  var cached = path.resolve(process.cwd(), '.giblets', details.name, details.version, dest),
      ghf = 'https://raw.githubusercontent.com/' + details.repo + '/' + details.version + '/' + details.path + src;

  return sander.readFile(cached).then(
    function(data) {
      if (write) return sander.writeFile(write, data).then(function() { return data; });
      else return data;
    },function() {
      return request(ghf).then(function(data) {
        sander.writeFile(cached, data).then(function() {
          if (write) return sander.writeFile(write, data).then(function() { return data; });
          else return data;
        });
      });
    }
  );
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

function processGiblethub(obj) {
  var i, j, part, file, src, dest, parts = [obj.scripts || [], obj.styles || [], obj.files || []];
  var results = [], result;


  for (j = 0; j < parts.length && (part = parts[j]); j++) {
    for (i = 0; i < part.length && (file = part[i]); i++) {
      if (typeof file === 'object') src = file.file, dest = file.target;
      else src = file, dest = file;

      result = cache(obj, src, dest);

      // for js (scripts), work with whatever modules are already there
      if (j === 0) {
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
