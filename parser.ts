import { parser } from "lezer-python";
import { TreeCursor } from "lezer";
import { TypedVar, Stmt, Expr, Type, isUniOp, isBinOp, Body, VarInit, FuncDef, ClassDef, isBuiltin1, isBuiltin2 } from './ast';

export function traverseType(c: TreeCursor, s: string): Type {
  c.firstChild(); // ":" or VariableName
  if (c.name == ":") {
    c.nextSibling(); // VariableName
  }
  switch (c.type.name) {
    case "VariableName":
      const typeString = s.substring(c.from, c.to);
      c.parent();
      if(typeString == "int") {
        return { tag: "primitive", name: "Int" };
      } else if(typeString == "bool") {
        return { tag: "primitive", name: "Bool" };
      } else {
        return { tag: "object", name: typeString };
      }
    case "None":
      c.parent();
      return { tag: "object", name: "NoneType" };
    default:
      throw new Error("ParseError: Unknown type " + c.type.name)
  }
}

export function traverseArgs(c: TreeCursor, s: string): Expr<null>[] {
  c.firstChild(); // "("
  var args = Array<Expr<any>>();
  c.nextSibling(); // expr or ")"
  while (c.name != ")"){
    args.push(traverseExpr(c, s));
    c.nextSibling(); // "," or ")"
    c.nextSibling(); // expr or ")"
  }
  c.parent(); // pop arglist
  return args;
}

export function traverseParams(c: TreeCursor, s: string): TypedVar<null>[] {

  // console.log("traverseParams", c.type.name);

  c.firstChild(); // "ParamList"
  var params = Array<TypedVar<null>>();
  while (c.nextSibling()) {  // "("
    var name = s.substring(c.from, c.to);
    c.nextSibling(); // "TypeDef" or ")"
    if (c.type.name === "TypeDef") {
      var type = traverseType(c, s);
      params.push({ name, type });
      c.nextSibling(); // "," or ")"
    } else if (c.type.name === ")") {
      break;
    } else {
      throw new Error("ParseError: Missed type annotation for parameter " + name);
    }
  }
  c.parent(); // pop paramlist
  return params;
}

export function traverseBody(c: TreeCursor, s: string): Body<null> {
  const body: Body<null> = { 
    varinits: [],
    funcdefs: [],
    classdefs: [],
    stmts: [],
   };
  do {
    const stmt = traverseStmt(c, s);
    var stmtStarted = false;
    if (stmt.tag === "varInit") {
      if (stmtStarted) {
        // TODO: Show which body 
        throw new Error("ParseError: Variable initializer after statement in body");
      }
     body.varinits.push(traverseVarInit(c, s));
    } else if (stmt.tag === "funcDef") {
      if (stmtStarted) {
        // TODO: Show which body 
        throw new Error("ParseError: Function definition after statement in body");
      }
      body.funcdefs.push(traverseFuncDef(c, s));
    } else if (stmt.tag === "classDef") {
      if (stmtStarted) {
        // TODO: Show which body 
        throw new Error("ParseError: Class definition after statement in body");
      } 
      body.classdefs.push(traverseClassDef(c, s));
    }
    else {
      stmtStarted = true;
      body.stmts.push(stmt);
      // TODO: Show error if there are statements after return
      if (stmt.tag === "return") {
        break;
      }
    }
  } while (c.nextSibling())
  c.prevSibling();
  return body;
}

export function traverseExpr(c: TreeCursor, s: string): Expr<null> {

  // console.log("traverseExpr", c.type.name);

  switch (c.type.name) {
    // literals
    case "Number":
      return {
        tag: "literal",
        value: { tag: "number", value: Number(s.substring(c.from, c.to)) }
      }
    case "Boolean":
      return {
        tag: "literal",
        value: { tag: "bool", value: s.substring(c.from, c.to) === "True" }
      }
    case "None":
      return {
        tag: "literal",
        value: { tag: "none" }
      }
    // name
    case "VariableName":
      var name = s.substring(c.from, c.to);
      return {
        tag: "id",
        name: name
      }
    // operators
    case "UnaryExpression":
      c.firstChild(); // go to operator
      var uniOp = s.substring(c.from, c.to);
      if (!isUniOp(uniOp)) {
        throw new Error("ParseError: Unknown unary operator: " + uniOp);
      }
      c.nextSibling(); // go to operand
      var operand = traverseExpr(c, s);
      c.parent(); // UnaryExpression
      return {
        tag: "uniexpr",
        op: uniOp,
        expr: operand
      }
    case "BinaryExpression":
      c.firstChild();
      var lhs = traverseExpr(c, s); // Expr
      c.nextSibling();
      var binOp = s.substring(c.from, c.to); // Operator
      if (!isBinOp(binOp)) {
        throw new Error("ParseError: Unknown binary operator: " + binOp);
      }
      c.nextSibling();
      var rhs = traverseExpr(c, s);
      c.parent();
      return {
        tag: "binexpr", op: binOp, lhs, rhs
      }
    case "ParenthesizedExpression":
      c.firstChild(); // "("
      c.nextSibling(); // Expr
      var expr = traverseExpr(c, s);
      c.parent();
      return expr;
    case "CallExpression":
      c.firstChild(); // VariableName
      var name = s.substring(c.from, c.to);
      c.nextSibling(); // ArgList
      var args = traverseArgs(c, s);
      c.parent();
      if (isBuiltin1(name)) {
        if (args.length != 1) {
          throw new Error("ParseError: Builtin function " + name + " takes 1 argument");
        }
        return {
          tag: "builtin1", name, arg: args[0]
        }
      } else if (isBuiltin2(name)) {
        if (args.length != 2) {
          throw new Error("ParseError: Builtin function " + name + " takes 2 arguments");
        }
        return {
          tag: "builtin2", name, arg1: args[0], arg2: args[1]
        }
      }
      return {
        tag: "call", name, args
      }
    default:
      throw new Error("ParseError: Could not parse expr " + c.type.name);
  }
}

export function traverseIf(c: TreeCursor, s: string): { tag: "if", cond: Expr<null>, then: Stmt<null>[], else: Stmt<null>[]} {
  c.nextSibling(); // condition
  var cond = traverseExpr(c, s);
  c.nextSibling(); // Body then
  c.firstChild(); // ":"
  c.nextSibling(); // stmt
  var then = traverseBody(c, s);
  c.parent(); // Body then
  if (then["varinits"].length > 0) {
    throw new Error("ParseError: then body cannot have varinits");
  }
  if (then["funcdefs"].length > 0) {
    throw new Error("ParseError: then body cannot have funcdefs");
  }
  if (!c.nextSibling()){ // "elif" or "else" or end
    return { tag: "if", cond, then: then["stmts"], else: [] };
  } 
  if (c.name === "elif") {
    c.nextSibling; // Body elif
    var elif = [traverseIf(c, s)];
    return { tag: "if", cond, then: then["stmts"], else: elif };
  } 
  c.nextSibling(); // Body else
  c.firstChild(); // ":"
  c.nextSibling(); // stmt
  var else_ = traverseBody(c, s);
  c.parent(); // Body else
  if (else_["varinits"].length > 0) {
    throw new Error("ParseError: else body cannot have varinits");
  }
  if (else_["funcdefs"].length > 0) {
    throw new Error("ParseError: else body cannot have funcdefs");
  }
  return { tag: "if", cond, then: then["stmts"], else: else_["stmts"] };
}

export function traverseStmt(c: TreeCursor, s: string): Stmt<null> {

  // console.log("traverseStmt", c.type.name);

  switch (c.type.name) {
    case "AssignStatement":
      c.firstChild(); // VariableName
      var name = s.substring(c.from, c.to);
      c.nextSibling(); // TypeDef
      if (typeNameCheck(c, "TypeDef")) {
        c.parent();
        // Deal in traverseVarInit
        return { tag: "varInit" };
      }
      c.nextSibling(); // AssignOp
      c.nextSibling(); // Expr
      var value = traverseExpr(c, s);
      c.parent(); // AssignStatement
      return { tag: "assign", name, value }
    case "IfStatement":
      // TODO: elif
      c.firstChild(); // "if"
      var if_ = traverseIf(c, s);
      c.parent(); // IfStatement
      return if_;
    case "WhileStatement":
      c.firstChild(); // "while"
      c.nextSibling(); // condition
      var cond = traverseExpr(c, s);
      c.nextSibling(); // Body
      c.firstChild(); // ":"
      c.nextSibling(); // stmt
      var loop = traverseBody(c, s);
      c.parent(); // "Body"
      c.parent(); // WhileStatement
      if (loop["varinits"].length > 0) {
        throw new Error("ParseError: while body cannot have varinits");
      }
      if (loop["funcdefs"].length > 0) {
        throw new Error("ParseError: while body cannot have funcdefs");
      }
      return { tag: "while", cond, loop: loop["stmts"] }
    case "PassStatement":
      return { tag: "pass" }
    case "ReturnStatement":
      c.firstChild(); // "return"
      var retExpr: Expr<null> = { tag: "literal", value: { tag: "none" } };
      // TODO: Check if this is a bug in the lexer parser
      if (c.nextSibling() && c.name != "⚠"){ // Expr or failed if "return" 
        retExpr = traverseExpr(c, s);
      }
      c.parent(); // "ReturnStatement"
      return { tag: "return", ret: retExpr }
    case "ExpressionStatement":
      c.firstChild();
      var expr = traverseExpr(c, s);
      c.parent(); // pop to stmt
      return { tag: "expr", expr: expr }
    // Deal in traverseFuncDef
    case "FunctionDefinition":
      return { tag: "funcDef" }
    case "ClassDefinition":
      return { tag: "classDef" }
    default:
      throw new Error("ParseError: Could not parse stmt at " + c.node.from + " " + c.node.to + ": " + c.type.name);
  }
}

export function typeNameCheck(c: TreeCursor, s: string): boolean {

  // console.log("typeNameCheck:", c.type.name, s, c.type.name === s);

  return c.type.name === s;
}

export function traverseVarInit(c: TreeCursor, s: string): VarInit<null> {

  // console.log("traverseVarInit", c.type.name);

  c.firstChild(); // VariableName
  var name = s.substring(c.from, c.to);
  c.nextSibling(); // TypeDef
  if (!typeNameCheck(c, "TypeDef")) {
    throw new Error("ParseError: Expected TypeDef, got " + c.type.name);
  }
  var type = traverseType(c, s);
  c.nextSibling(); // AssignOp
  c.nextSibling(); // Literal
  var init = traverseExpr(c, s);
  if (init.tag !== "literal") {
    throw new Error("ParseError: Expected literal for variable initialization, got " + init.tag);
  }
  c.parent(); // AssignStatement
  return { name, type, init: init.value };
}

export function traverseFuncDef(c: TreeCursor, s: string): FuncDef<null> {

  // console.log("traverseFuncDef", c.type.name);

  c.firstChild(); // "def"
  c.nextSibling(); // VariableName
  var name = s.substring(c.from, c.to);
  c.nextSibling(); // ParamList
  var params = traverseParams(c, s);
  c.nextSibling(); // go to Body or TypeDef
  var ret: Type = { tag: "object", name: "NoneType" };
  if (typeNameCheck(c, "TypeDef")) {
    ret = traverseType(c, s);
    c.nextSibling(); // go to Body
  }
  c.firstChild(); // ":"
  c.nextSibling(); // stmt
  var body = traverseBody(c, s);
  c.parent(); // Body
  c.parent(); // FunctionDefinition
  if (body["funcdefs"].length > 0) {
    throw new Error("ParseError: function body cannot have funcdefs");
  }
  return { name, params, body, ret };
}

export function traverseClassDef(c: TreeCursor, s: string): ClassDef<null> { 

  c.firstChild() // "class"
  c.nextSibling() // VariableName
  var name = s.substring(c.from, c.to)
  c.nextSibling() // ArgList
  var args = traverseArgs(c, s)
  if (args.length !== 1){
    throw new Error("ParseError: class can and must have one super class")
  }
  if (args[0].tag !== "id"){
    throw new Error("ParseError: invalid super class for class " + name)
  }
  c.nextSibling() // Body
  var body = traverseBody(c, s)
  if (body.classdefs.length !== 0){
    throw new Error("ParseError: class body cannot have classdefs");
  }
  if (body.stmts.length !== 0){
    throw new Error("ParseError: class body cannot have stmts");
  }
  return {name, super: args[0].name, body}
}

export function traverse(c: TreeCursor, s: string): Body<null> {
  switch (c.type.name) {
    case "Script":
      c.firstChild();
      const prog = traverseBody(c, s);
      c.parent();
      console.log("traversed " + prog.varinits.length + " varinits, " + prog.funcdefs.length + " funcdefs, and " + prog.stmts.length + " statements");
      return prog;
    default:
      throw new Error("ParseError: Could not parse program at " + c.node.from + " " + c.node.to);
  }
}

export function parse(source: string): Body<null> {
  const t = parser.parse(source);
  return traverse(t.cursor(), source);
}
