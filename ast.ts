export type Body<A> = {
  a?: A, varinits?: VarInit<A>[], funcdefs?: FuncDef<A>[], stmts: Stmt<A>[]
}

export type ClassDef<A> = {
  a?: A, name: string, super: string, body: Body<A>
}

export type VarInit<A> = {
  a?: A, name: string, type: Type, init: Literal<A>
}

export type TypedVar<A> = {
  a?: A, name: string, type: Type
}

// export type FuncDef<A> = {
//   a?: A, name: string, class?: string, params: TypedVar<A>[], varinits: VarInit<A>[], ret: Type, stmts: Stmt<A>[]
// }

export type FuncDef<A> = {
  a?: A, name: string, class?: string, params: TypedVar<A>[], body: Body<A>, ret: Type
}

export type Stmt<A> =
  | { a?: A, tag: "assign", name: string, value: Expr<A> }
  | { a?: A, tag: "if", cond: Expr<A>, then: Stmt<A>[], else: Stmt<A>[] }
  | { a?: A, tag: "while", cond: Expr<A>, loop: Stmt<A>[] }
  | { a?: A, tag: "pass" }
  | { a?: A, tag: "return", ret: Expr<A> }
  | { a?: A, tag: "expr", expr: Expr<A> }
  | { a?: A, tag: "varinit"}
  | { a?: A, tag: "funcdef"}

export type Expr<A> = 
  | { a?: A, tag: "literal", value: Literal<A> }
  | { a?: A, tag: "id", name: string }
  | { a?: A, tag: "uniexpr", op: UniOp, expr: Expr<A> }
  | { a?: A, tag: "binexpr", op: BinOp, lhs: Expr<A>, rhs: Expr<A> }
  | { a?: A, tag: "call", name: string, args: Expr<A>[] }
  | { a?: A, tag: "builtin1", name: builtin1, arg: Expr<A> }
  | { a?: A, tag: "builtin2", name: builtin2, arg1: Expr<A>, arg2: Expr<A> }

export enum builtin1 {
  print = "print",
  abs = "abs",
}

export enum builtin2 {
  min = "min",
  max = "max",
  pow = "pow",
}

export enum UniOp {
  Neg = "-",
  Not = "not",
}

export enum BinOp { 
  Add = "+",
  Sub = "-",
  Mul = "*",
  Div = "//",
  Mod = "%",
  Eq = "==",
  Ne = "!=",
  Lt = "<",
  Gt = ">",
  Le = "<=",
  Ge = ">=",
  Is = "is"
}

export type Literal<A> = 
  | { a?: A, tag: "number", value: number }
  | { a?: A, tag: "bool", value: boolean }
  | { a?: A, tag: "none" }

// None: NoneType
export type Type = 
  | { tag: "primitive", name: "Int" | "Bool" }
  | { tag: "object", name: string }

export function isBuiltin1(maybeBuiltin1: string): maybeBuiltin1 is builtin1 {
  return (<any>Object).values(builtin1).includes(maybeBuiltin1);
}

export function isEqualType(type1: Type, type2: Type): boolean {
  if (type1.tag === "primitive" && type2.tag === "primitive") {
    return type1.name === type2.name;
  }
  return type1.name === type2.name;
}

export function isEqualPrimitiveType(type: Type, prim: string): boolean {
  return type.tag === "primitive" && type.name === prim;
}

export function isBuiltin2(maybeBuiltin2: string): maybeBuiltin2 is builtin2 {
  return (<any>Object).values(builtin2).includes(maybeBuiltin2);
}

export function isUniOp(maybeOp: string): maybeOp is UniOp {
  return (<any>Object).values(UniOp).includes(maybeOp);
}

export function isBinOp(maybeOp : string) : maybeOp is BinOp {
  return (<any>Object).values(BinOp).includes(maybeOp);
}
