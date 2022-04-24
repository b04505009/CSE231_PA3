import { compile } from './compiler';
import { run } from './runner';
import { parse } from './parser';
import { typeCheckProgram } from './typechecker';
import { stringifyTree } from "./treeprinter";

const importObject = {
  imports: {
    // we typically define print to mean logging to the console. To make testing
    // the compiler easier, we define print so it logs to a string object.
    //  We can then examine output to see what would have been printed in the
    //  console.
    print_num: (arg : any) => {
      console.log(arg);
      return arg;
    },
    print_bool: (arg : any) => {
      if(arg !== 0) { console.log("True"); }
      else { console.log("False"); }
    },
    print_none: (arg : any) => {
      console.log("None");
    },
    abs: Math.abs,
    max: Math.max,
    min: Math.min,
    pow: Math.pow
  },

  output: ""
};

// command to run:
// node node-main.js 987
const input = process.argv[2];
const parsed_prog = parse(input);
const typed_prog = typeCheckProgram(parsed_prog);
const result = compile(typed_prog);
console.log(result.wasmSource);
run(result.wasmSource, importObject).then((value) => {
  console.log(value);
});

