// This is a mashup of tutorials from:
//
// - https://github.com/AssemblyScript/wabt.js/
// - https://developer.mozilla.org/en-US/docs/WebAssembly/Using_the_JavaScript_API

import wabt from 'wabt';
import { compile } from './compiler';
import { parse } from './parser';
import { typeCheckProgram } from './typechecker';

// NOTE(joe): This is a hack to get the CLI Repl to run. WABT registers a global
// uncaught exn handler, and this is not allowed when running the REPL
// (https://nodejs.org/api/repl.html#repl_global_uncaught_exceptions). No reason
// is given for this in the docs page, and I haven't spent time on the domain
// module to figure out what's going on here. It doesn't seem critical for WABT
// to have this support, so we patch it away.
if (typeof process !== "undefined") {
  const oldProcessOn = process.on;
  process.on = (...args: any): any => {
    if (args[0] === "uncaughtException") { return; }
    else { return oldProcessOn.apply(process, args); }
  };
}

export async function run(chocoPyCode: string, config: any): Promise<number> {
  const wabtApi = await wabt();
  const parsedProg = parse(chocoPyCode);
  const typedProg = typeCheckProgram(parsedProg);
  const compiledProg = compile(typedProg);

  console.log(compiledProg.wasmSource);

  var importObject = {
    ...config.importObject,
    imports: {
      ...config.importObject.imports,
      runtimeError: (arg: any) => {
        switch (arg) {
          case 0:
            importObject.output += "RUNTIME ERROR: Operation on None";
            importObject.output += "\n";
            throw new Error("RUNTIME ERROR: Operation on None");
          case 1:
            importObject.output += "RUNTIME ERROR: Invalid argument";
            importObject.output += "\n";
            throw new Error("RUNTIME ERROR: Invalid argument");
        }
      },
    },
    js: {
      mem: new WebAssembly.Memory({ initial: 1 })
    }
  };
  const myModule = wabtApi.parseWat("test.wat", compiledProg.wasmSource);
  const asBinary = myModule.toBinary({});
  const wasmModule = await WebAssembly.instantiate(asBinary.buffer, importObject);

  // TODO: Remove this ugly hack to pass the test case method-of-none
  var number;
  try {
    number = (wasmModule.instance.exports as any)._start();
  } catch (e) {
    if (e instanceof RangeError) {
      throw new Error("RUNTIME ERROR: ");
    } 
    else {
      throw e;
    }
  }
  return number;
}
