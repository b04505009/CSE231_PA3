import { importObject } from "./import-object.test";
import { compile } from '../compiler';
import { parse } from '../parser';
import { typeCheckProgram } from '../typechecker';
import { run as run_ } from '../runner';


// Modify typeCheck to return a `Type` as we have specified below
export function typeCheck(source: string): Type {
  const parsed_prog = parse(source);
  const typed_prog = typeCheckProgram(parsed_prog);
  const type = typed_prog.a
  if (type.tag === "primitive") {
    return type.name;
  } else {
    if (type.name === "None") {
      return "none";
    } else {
      return CLASS(type.name);
    }
  }
}

// Modify run to use `importObject` (imported above) to use for printing
export async function run(source: string) {
  return run_(source, { importObject })
}

type Type =
  | "int"
  | "bool"
  | "none"
  | { tag: "object", class: string }

export const NUM: Type = "int";
export const BOOL: Type = "bool";
export const NONE: Type = "none";
export function CLASS(name: string): Type {
  return { tag: "object", class: name }
};
