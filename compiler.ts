import { Body, Type, Expr, Stmt, Literal, BinOp, UniOp, VarInit, FuncDef, TypedVar, isBuiltin1 } from "./ast";

// https://learnxinyminutes.com/docs/wasm/

type LocalEnv = Map<string, boolean>;

type CompileResult = {
  wasmSource: string,
};

export function compile(prog: Body<Type>) : CompileResult {

  // console.log("compile: ", prog);

  const emptyEnv : LocalEnv = new Map();

  const varsCode = prog.varinits.map(v => `(global $${v.name} (mut i32) ${codeGenLiteral(v.init)})`).join("\n");
  const funcsCode = prog.funcdefs.map(f => codeGenFunc(f, emptyEnv)).map(s => s.join("\n")).join("\n\n");
  const stmtsCode = prog.stmts.map(s => codeGenStmt(s, emptyEnv)).flat();

  const mainCode = [`(local $scratch i32)`, ...stmtsCode].join(
    `
        `);

  // TODO: Maybe check in typechecker?
  var retType = "";
  var retVal = "";
  if (prog.stmts.length > 0 && prog.stmts[prog.stmts.length-1].tag === "expr") {
    // return the last expression
    retType = "(result i32)";
    retVal = "(local.get $scratch)"
  }

  return {wasmSource :`
    (module
      (func $print_num (import "imports" "print_num") (param i32) (result i32))
      (func $print_bool (import "imports" "print_bool") (param i32) (result i32))
      (func $print_none (import "imports" "print_none") (param i32) (result i32))
      (func $abs (import "imports" "abs") (param i32) (result i32))
      (func $max (import "imports" "max") (param i32) (param i32) (result i32))
      (func $min (import "imports" "min") (param i32) (param i32) (result i32))
      (func $pow (import "imports" "pow") (param i32) (param i32) (result i32))
      ${varsCode}
      ${funcsCode}
      (func (export "_start") ${retType}
        ${mainCode}
        ${retVal}
      )
    ) 
  `};
}

export function codeGenFunc(func : FuncDef<any>, localEnv_: LocalEnv) : Array<string> {
  const localEnv = new Map(localEnv_);
  var params = "";
  if (func.params.length > 0) {
    params = func.params.map(p => `(param $${p.name} i32)`).join(" ");
  }
  func.params.forEach(p => localEnv.set(p.name, true));
  const varinits = func.body.varinits.map(v => `(local $${v.name} i32) (local.set $${v.name} ${codeGenLiteral(v.init)})`).join("\n");
  func.body.varinits.forEach(v => localEnv.set(v.name, true));
  const body = func.body.stmts.map(s => codeGenStmt(s, localEnv)).map(s => s.join("\n")).join("\n");
  return [
    `(func $${func.name} ${params} (result i32)
       (local $scratch i32)
       ${varinits}
       ${body}
       (i32.const 0)
     )`];
} 

export function codeGenStmt(stmt : Stmt<Type>, localEnv : LocalEnv) : Array<string> {
  switch(stmt.tag) {
    case "assign":
      var valExpr = codeGenExpr(stmt.value, localEnv);
      if (localEnv.get(stmt.name)) {
        return valExpr.concat([`(local.set $${stmt.name})`]);
      }
      return valExpr.concat([`(global.set $${stmt.name})`]);
    case "if":
      const condExpr_if = codeGenExpr(stmt.cond, localEnv); 
      const thenStmts = stmt.then.map(s => codeGenStmt(s, localEnv)).flat();
      const elseStmts = stmt.else.map(s => codeGenStmt(s, localEnv)).flat();
      return [
        ...condExpr_if,
        `(if
          (then
            ${thenStmts.join("\n")}
          )
          (else
            ${elseStmts.join("\n")}
          )
        )`
      ];
    case "while":
      const condExpr_while = codeGenExpr(stmt.cond, localEnv);
      const loopStmts = stmt.loop.map(s => codeGenStmt(s, localEnv)).flat();
      return [
        "(block",
        "(loop", 
        ...condExpr_while, 
        "(i32.eqz)",
        "(br_if 1)",
        ...loopStmts,
        "(br 0)",
        ")",
        ")"];
    case "pass":
      return [];
    case "return":
      const retExpr = codeGenExpr(stmt.ret, localEnv);
      retExpr.push("(return)");
      return retExpr;
    case "expr":
      const result = codeGenExpr(stmt.expr, localEnv);
      result.push("(local.set $scratch)");
      return result;
  }
  return Array<string>();
}


function codeGenExpr(expr : Expr<Type>, localEnv: LocalEnv) : Array<string> {
  switch(expr.tag) {
    case "literal":
      return [codeGenLiteral(expr.value)];
    case "id":
      if (localEnv.get(expr.name)) {
        return [`(local.get $${expr.name})`];
      }
      return [`(global.get $${expr.name})`];
    case "uniexpr":
      return ["(i32.const 0)", ...codeGenExpr(expr.expr, localEnv), codeGenUniOp(expr.op)];
    case "binexpr":
      const leftStmts = codeGenExpr(expr.lhs, localEnv);
      const rightStmts = codeGenExpr(expr.rhs,localEnv);
      const opStmts = codeGenBinOp(expr.op);
      return [...leftStmts, ...rightStmts, opStmts];
    case "call":
      const args = expr.args.map(a => codeGenExpr(a, localEnv)).flat();
      return [...args, `(call $${expr.name})`];
    case "builtin1":
      const argStmts = codeGenExpr(expr.arg, localEnv);
      switch(expr.name) {
        case "print":
          if (expr.arg.a.tag == "primitive") {
            switch (expr.arg.a.name) {
              case "Int":
                return [...argStmts, "(call $print_num)"];
              case "Bool":
                return [...argStmts, "(call $print_bool)"];
            }
          } else {
            switch (expr.arg.a.name) {
              case "NoneType":
                return [...argStmts, "(call $print_none)"];
              default:
                throw new Error("Unsupported type for print" + expr.arg.a.name);
          }
          }
        case "abs":
          return [...argStmts, `(call $abs)`];
        default:
          throw new Error("Unsupported builtin1: " + expr.name);
        }
    case "builtin2":
      const arg1Stmts = codeGenExpr(expr.arg1, localEnv);
      const arg2Stmts = codeGenExpr(expr.arg2, localEnv);
      switch(expr.name) {
        case "min":
          return [...arg1Stmts, ...arg2Stmts, `(call $min)`];
        case "max":
          return [...arg1Stmts, ...arg2Stmts, `(call $max)`];
        case "pow":
          return [...arg1Stmts, ...arg2Stmts, `(call $pow)`];
        default:
          throw new Error("Unsupported builtin2: " + expr.name);
      }
    default:
      // throw new Error("Unsupported expr: " + expr.tag);
  }
}

function codeGenLiteral(lit : Literal<Type>) : string {
  switch(lit.tag) {
    case "number":
      return "(i32.const " + lit.value + ")";
    case "bool":
      return "(i32.const " + (lit.value ? 1 : 0) + ")";
    case "none":
      return "(i32.const 0)";
  }
}

function codeGenUniOp(op : UniOp) : string {
  switch(op) {
    case UniOp.Neg:
      return "(i32.sub)";
    case UniOp.Not:
      return "(i32.eqz)";
  }
}

function codeGenBinOp(op : BinOp) : string {
  switch(op) {
    case BinOp.Add:
      return "(i32.add)";
    case BinOp.Sub:
      return "(i32.sub)";
    case BinOp.Mul:
      return "(i32.mul)";
    case BinOp.Div:
      return "(i32.div_s)";
    case BinOp.Mod:
      return "(i32.rem_s)";
    case BinOp.Eq:
      return "(i32.eq)";
    case BinOp.Ne:
      return "(i32.ne)";
    case BinOp.Lt:
      return "(i32.lt_s)";
    case BinOp.Le:
      return "(i32.le_s)";
    case BinOp.Gt:
      return "(i32.gt_s)";
    case BinOp.Ge:
      return "(i32.ge_s)";
    case BinOp.Is:
      return "(i32.eq)";
  }
}
