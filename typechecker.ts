import { Body, Type, Expr, Stmt, Literal, BinOp, VarInit, FuncDef, NoneType, ClassDef, isEqualType, isEqualPrimitiveType } from "./ast";

type TypeEnv = {
  var?: Map<string, Type>;
  func?: Map<string, [Type[], Type]>;
  // Todo: Add return type
  mangledFuncs?: Set<string>;
  class?: Map<string, TypeEnv>;
  ret?: Type;
}



export function funcNameMangling(name: string, objName: string, args: Type[]): string {
  return objName + "$$" + name + "$$" + args.map(t => t.name.toString()).join("$");
}

export function checkDuplicateID(name: string, mapList: (Map<string, any> | Set<string>)[]): void {
  for (const mapOrSet of mapList) {
    if (mapOrSet.has(name)) {
      throw new Error("ReferenceError: Duplicate declaration of identifier in same scope: " + name);
    }
  }
}

export function typeCheckProgram(prog: Body<null>): Body<Type> {

  const globalEnv: TypeEnv = {
    var: new Map(),
    func: new Map(),
    mangledFuncs: new Set(),
    class: new Map(),
  }
  globalEnv.func.set("$$print$$int",
    [
      [{ tag: "primitive", name: "int" }],
      { tag: "object", name: "None" }
    ]
  );
  globalEnv.func.set("$$print$$bool",
    [
      [{ tag: "primitive", name: "bool" }],
      { tag: "object", name: "None" }
    ]
  );
  globalEnv.func.set("$$print$$none",
    [
      [{ tag: "object", name: "None" }],
      { tag: "object", name: "None" }
    ]
  );

  const typedProg: Body<Type> = {
    varinits: [],
    stmts: [],
    funcdefs: [],
    classdefs: [],
  }

  console.log("typeCheckProgram:", prog)

  // Add varinits to globalEnv
  prog.varinits.forEach(varinit => {
    checkDuplicateID(varinit.name, [globalEnv.var]);
    globalEnv.var.set(varinit.name, varinit.type);
  });

  // Add unmangled funcdefs to globalEnv
  prog.funcdefs.forEach(funcdef => {
    // funcname cannot duplicate with var
    checkDuplicateID(funcdef.name, [globalEnv.var]);
    globalEnv.func.set(funcdef.name, [funcdef.params.map(p => p.type), funcdef.ret]);
  });

  // Add mangled funcdefs to globalEnv
  prog.funcdefs.forEach(funcdef => {
    // mangled funcname cannot duplicate with each other
    const mangledName = funcNameMangling(funcdef.name, "", funcdef.params.map(p => p.type));
    checkDuplicateID(mangledName, [globalEnv.mangledFuncs]);
    globalEnv.mangledFuncs.add(mangledName);
  });

  // Check classdefs
  // Add classdefs to globalEnv
  prog.classdefs.forEach(classdef => {
    // classname cannot duplicate with var, func, class
    checkDuplicateID(classdef.name, [globalEnv.var, globalEnv.func, globalEnv.class]);
    // Add class to globalEnv.class
    globalEnv.class.set(classdef.name, {
      var: new Map(),
      func: new Map(),
      class: new Map(),
    });

    // TODO: For class in class, we have to add all the members and methods of all the subclasses recursively

    // Add varinits to globalEnv.class[classdef.name].var
    classdef.body.varinits.forEach(varinit => {
      checkDuplicateID(varinit.name, [globalEnv.class.get(classdef.name).var]);
      globalEnv.class.get(classdef.name).var.set(varinit.name, varinit.type);
    });

    // Add funcdefs to globalEnv.class[classdef.name].func
    classdef.body.funcdefs.forEach(funcdef => {
      // funcname cannot duplicate with var, func
      checkDuplicateID(funcdef.name, [globalEnv.class.get(classdef.name).var]);
      // Add func to globalEnv.class
      globalEnv.class.get(classdef.name).func.set(funcdef.name, [funcdef.params.map(p => p.type), funcdef.ret]);
    });

    // Add mangled funcdefs to globalEnv
    classdef.body.funcdefs.forEach(funcdef => {
      // mangled funcname cannot duplicate with each other
      const mangledName = funcNameMangling(funcdef.name, classdef.name, funcdef.params.map(p => p.type));
      checkDuplicateID(mangledName, [globalEnv.mangledFuncs]);
      globalEnv.mangledFuncs.add(mangledName);
    });
  })

  console.log("globalEnv:", globalEnv)

  // Check varinits
  typedProg.varinits = typeCheckVarInits(prog.varinits);
  // Check funcdefs
  prog.funcdefs.forEach(funcdef => {
    typedProg.funcdefs.push(typeCheckFuncDef(funcdef, globalEnv));
  });
  // Check classdefs
  prog.classdefs.forEach(classdef => {
    typedProg.classdefs.push(typeCheckClassDef(classdef, globalEnv));
  });

  if (checkReturn(prog.stmts)) {
    throw new Error("TypeError: Return Statement cannot appear at the top level");
  }
  typedProg.stmts = typeCheckStmts(prog.stmts, globalEnv, {
    var: new Map(),
    func: new Map(),
    class: new Map(),
  });
  typedProg.a = { tag: "object", name: "None" }
  if (typedProg.stmts.length > 0) {
    typedProg.a = typedProg.stmts[typedProg.stmts.length - 1].a;
  }
  return typedProg;
}

// method names are already mangled
export function typeCheckClassDef(classdef: ClassDef<null>, globalEnv: TypeEnv): ClassDef<Type> {

  if (classdef.super !== "object") {
    throw new Error("TypeError: Superclass must be object for now.");
  }
  const memberInits: VarInit<null>[] = classdef.body.varinits;
  const methodDefs: FuncDef<null>[] = classdef.body.funcdefs;

  const typedClass: Body<Type> = {
    varinits: [],
    funcdefs: [],
  }
  // Check varinits
  typedClass.varinits = typeCheckVarInits(memberInits);
  // Check funcdefs
  methodDefs.forEach(methoddef => {
    typedClass.funcdefs.push(typeCheckFuncDef(methoddef, globalEnv));
  });

  return { ...classdef, body: typedClass };
}

export function typeCheckStmts(stmts: Stmt<null>[], localEnv: TypeEnv, nonLocalEnv: TypeEnv): Stmt<Type>[] {
  // If multiple maps have the same key, the value of the merged map will be the value of the last merging map with that key.
  const refEnv: TypeEnv = {
    var: new Map([...nonLocalEnv.var, ...localEnv.var]),
    func: new Map([...nonLocalEnv.func, ...localEnv.func]),
    class: new Map([...nonLocalEnv.class, ...localEnv.class]),
    mangledFuncs: new Set([...nonLocalEnv.mangledFuncs, ...localEnv.mangledFuncs]),
    ret: localEnv.ret,
  }

  const typedStmts: Stmt<Type>[] = [];
  stmts.forEach(stmt => {

    // console.log("typeCheckStmts: ", stmt)

    switch (stmt.tag) {
      case "assign":
        if (stmt.target.tag !== "id") {
          throw new Error(`TypeError: Invalid target for assignment: ${stmt.target}`);
        }
        const typedObj = typeCheckExpr(stmt.target.obj, refEnv);
        // Normal variable assignment
        if (typedObj === null) {
          if (!refEnv.var.has(stmt.target.name)) {
            throw new Error("ReferenceError: Undefined variable: " + stmt.target.name);
          }
          if (!localEnv.var.has(stmt.target.name)) {
            throw new Error("ReferenceError: Cannot assign to non-local variable " + stmt.target.name);
          }
          const typedValue = typeCheckExpr(stmt.value, refEnv);
          if (!isEqualType(typedValue.a, refEnv.var.get(stmt.target.name))) {
            throw new Error(`TypeError: Cannot assign value of type ${typedValue.a.name} to variable ${stmt.target.name} of type ${refEnv.var.get(stmt.target.name).name}`);
          }
          typedStmts.push({ ...stmt, a: { tag: "object", name: "None" } });
          break;
        }
        // Class member assignment
        if (typedObj.a.tag !== "object") {
          throw new Error(`TypeError: Cannot do member assignment to non-object: ${typedObj.a.name}`);
        }
        const typedValue = typeCheckExpr(stmt.value, refEnv);
        if (!isEqualType(refEnv.class.get(typedObj.a.name).var.get(stmt.target.name), typedValue.a)) {
          throw new Error(`TypeError: Cannot assign value of type ${typedValue.a.name} to member ${stmt.target.name} of type ${refEnv.class.get(typedObj.a.name).var.get(stmt.target.name).name}`);
        }
        typedStmts.push({ ...stmt, a: { tag: "object", name: "None" } });
        break;
      case "return":
        const typedRet = typeCheckExpr(stmt.ret, refEnv);
        if (!isEqualType(typedRet.a, refEnv.ret)) {
          throw new Error(`TypeError: Cannot return value of type ${typedRet.a.name} from function with return type ${refEnv.ret.name}`);
        }
        typedStmts.push({ ...stmt, a: { tag: "object", name: "None" }, ret: typedRet });
        return typedStmts;
      case "if":
        const typedCond_if = typeCheckExpr(stmt.cond, refEnv);
        if (!isEqualPrimitiveType(typedCond_if.a, "bool")) {
          throw new Error(`TypeError: Cannot use value of type ${typedCond_if.a.name} as condition`);
        }
        const typedThen = typeCheckStmts(stmt.then, localEnv, nonLocalEnv);
        const typedElse = typeCheckStmts(stmt.else, localEnv, nonLocalEnv);
        typedStmts.push({ ...stmt, a: { tag: "object", name: "None" }, cond: typedCond_if, then: typedThen, else: typedElse });
        break;
      case "while":
        const typedCond_while = typeCheckExpr(stmt.cond, refEnv);
        if (!isEqualPrimitiveType(typedCond_while.a, "bool")) {
          throw new Error(`TypeError: Cannot use value of type ${typedCond_while.a} as condition`);
        }
        const typedLoop = typeCheckStmts(stmt.loop, localEnv, nonLocalEnv);
        typedStmts.push({ ...stmt, a: { tag: "object", name: "None" }, cond: typedCond_while, loop: typedLoop });
        break;
      case "pass":
        typedStmts.push({ ...stmt, a: { tag: "object", name: "None" } });
        break;
      case "expr":
        const typedExpr = typeCheckExpr(stmt.expr, refEnv);
        typedStmts.push({ ...stmt, a: typedExpr.a, expr: typedExpr });
        break;
    }
  });
  return typedStmts;
}


export function typeCheckVarInits(inits: VarInit<null>[]): VarInit<Type>[] {
  const typedInits: VarInit<Type>[] = [];
  inits.forEach(init => {
    const typedInit = typeCheckLiteral(init.init);
    if (typedInit.a.tag != init.type.tag) {
      throw new Error(`TypeError: Cannot initialize variable ${init.name} of type ${init.type.name} with value of type ${typedInit.a.name}`);
    }
    if (typedInit.a.tag === "primitive") {
      if (!isEqualType(typedInit.a, init.type)) {
        throw new Error("TypeError: Cannot initialize variable " + init.name + " of type " + init.type.name + " with value of type " + typedInit.a.name);
      }
    }
    else if (typedInit.a.tag === "object") {
      if (typedInit.a.name !== "None") {
        throw new Error("TypeError: Object could only be initialized with None:" + typedInit.a.name);
      }
    }
    typedInits.push({ ...init, a: init.type, init: typedInit });
  });
  return typedInits;
}

export function checkReturn(stmts: Stmt<Type>[]): boolean {
  if (stmts.length === 0) {
    return false;
  }
  const lastStmt = stmts[stmts.length - 1];
  if (lastStmt.tag === "return") {
    return true
  }
  if (lastStmt.tag === "if") {
    const thenReturn = checkReturn(lastStmt.then);
    const elseReturn = checkReturn(lastStmt.else);
    return thenReturn && elseReturn;
  }
  if (lastStmt.tag === "while") {
    return checkReturn(lastStmt.loop);
  }
  return false;
}

// TODO: localEnv should be created outside of this function and passed in?
export function typeCheckFuncDef(def: FuncDef<null>, nonLocalEnv: TypeEnv): FuncDef<Type> {
  const localEnv: TypeEnv = {
    var: new Map(),
    func: new Map(),
    class: new Map(),
    mangledFuncs: new Set(),
  };
  const typedParams = def.params.map(param => ({ ...param, a: param.type }))
  // Add parameters to local env
  typedParams.forEach(param => {
    localEnv.var.set(param.name, param.type);
  });
  // Add local var to local env
  const typedInits = typeCheckVarInits(def.body.varinits);
  typedInits.forEach(init => {
    checkDuplicateID(init.name, [localEnv.var]);
    localEnv.var.set(init.name, init.type);
  });

  // TODO: function in function

  // Add return type to local env
  localEnv.ret = def.ret;
  // Type check body
  const typedStmts = typeCheckStmts(def.body.stmts, localEnv, nonLocalEnv);

  // If return type is not none, check if the function returns a value in all the paths
  if (!isEqualType(def.ret, { tag: "object", name: "None" }) && !checkReturn(typedStmts)) {
    throw new Error("TypeError: All paths in this method / function must have a return value: " + def.name);
  }
  // If return type is none, add a return statement if there isn't one
  if (isEqualType(def.ret, { tag: "object", name: "None" }) && !checkReturn(typedStmts)) {
    typedStmts.push({ tag: "return", ret: { tag: "literal", a: { tag: "object", name: "None" }, value: { tag: "none" } } });
  }

  return { ...def, params: typedParams, body: { a: def.ret, varinits: typedInits, stmts: typedStmts } };
}

// Merge to typeCheckFuncDef
export function typeCheckMethodDef(def: FuncDef<null>, classEnv: TypeEnv, nonLocalEnv: TypeEnv): FuncDef<Type> {
  const localEnv: TypeEnv = {
    var: new Map(),
    func: new Map(),
    class: new Map(),
  };
  const typedParams = def.params.map(param => ({ ...param, a: param.type }))
  // Add parameters to local env
  typedParams.forEach(param => {
    localEnv.var.set(param.name, param.type);
  });
  // Add local var to local env
  const typedInits = typeCheckVarInits(def.body.varinits);
  typedInits.forEach(init => {
    if (localEnv.var.has(init.name)) {
      throw new Error("ReferenceError: Duplicate declaration of identifier in same scope: " + init.name);
    }
    localEnv.var.set(init.name, init.type);
  });

  // TODO: function in function

  // Add return type to local env
  localEnv.ret = def.ret;
  // Type check body
  const typedStmts = typeCheckStmts(def.body.stmts, localEnv, nonLocalEnv);

  // If return type is not none, check if the function returns a value in all the paths
  if (!isEqualType(def.ret, { tag: "object", name: "None" }) && !checkReturn(typedStmts)) {
    throw new Error("TypeError: All paths in this method / function must have a return value: " + def.name);
  }
  // If return type is none, add a return statement if there isn't one
  if (isEqualType(def.ret, { tag: "object", name: "None" }) && !checkReturn(typedStmts)) {
    typedStmts.push({ tag: "return", ret: { tag: "literal", a: { tag: "object", name: "None" }, value: { tag: "none" } } });
  }

  return { ...def, params: typedParams, body: { a: def.ret, varinits: typedInits, stmts: typedStmts } };
}

export function typeCheckExpr(expr: Expr<null>, refEnv: TypeEnv): Expr<Type> {

  // console.log("typeCheckExpr: ", expr)

  if (expr === null) {
    return null;
  }
  switch (expr.tag) {
    case "literal":
      const lit = typeCheckLiteral(expr.value);
      return {
        ...expr,
        a: lit.a
      };
    case "id":
      // Normal variable
      if (expr.obj === null) {
        if (!refEnv.var.has(expr.name)) {
          throw new Error(`ReferenceError: Undefined variable ${expr.name}`);
        }
        return {
          ...expr,
          a: refEnv.var.get(expr.name)
        };
      }
      // Member variable
      const typedObj = typeCheckExpr(expr.obj, refEnv);
      // check if obj class is defined
      if (!refEnv.class.has(typedObj.a.name)) {
        throw new Error(`TypeError: Cannot access property of non-class: ${typedObj.a.name}`);
      }
      // check if obj class has member variable
      if (!refEnv.class.get(typedObj.a.name).var.has(expr.name)) {
        throw new Error(`TypeError: Class ${typedObj.a.name} has no property ${expr.name}`);
      }
      return {
        ...expr,
        a: refEnv.var.get(expr.name),
        obj: typedObj
      };
    case "uniexpr":
      const typedUniExpr = typeCheckExpr(expr.expr, refEnv);
      return {
        ...expr,
        a: typedUniExpr.a
      };
    case "binexpr":
      const lhs = typeCheckExpr(expr.lhs, refEnv);
      const rhs = typeCheckExpr(expr.rhs, refEnv);
      if (!isEqualType(lhs.a, rhs.a)) {
        throw new Error("TypeError: Cannot operate " + lhs.a.name + " type and " + rhs.a.name + " type with operator " + expr.op);
      }
      switch (expr.op) {
        case BinOp.Eq:
        case BinOp.Ne:
          if (isEqualPrimitiveType(lhs.a, "int")) {
            return {
              ...expr,
              a: { tag: "primitive", name: "bool" },
              lhs: lhs,
              rhs: rhs
            };
          }
          if (isEqualPrimitiveType(lhs.a, "bool")) {
            return {
              ...expr,
              a: { tag: "primitive", name: "bool" },
              lhs: lhs,
              rhs: rhs
            };
          }
          throw new Error("TypeError: Cannot operate " + lhs.a + " and " + rhs.a + " with operator " + expr.op);
        case BinOp.Lt:
        case BinOp.Le:
        case BinOp.Gt:
        case BinOp.Ge:
          if (isEqualPrimitiveType(lhs.a, "int")) {
            return {
              ...expr,
              a: { tag: "primitive", name: "bool" },
              lhs: lhs,
              rhs: rhs
            };
          }
          throw new Error("TypeError: Cannot operate " + lhs.a + " and " + rhs.a + " with operator " + expr.op);
        case BinOp.Add:
        case BinOp.Sub:
        case BinOp.Mul:
        case BinOp.Div:
        case BinOp.Mod:
          if (isEqualPrimitiveType(lhs.a, "int")) {
            return {
              ...expr,
              a: { tag: "primitive", name: "int" },
              lhs: lhs,
              rhs: rhs
            };
          }
          throw new Error("TypeError: Cannot operate " + lhs.a + " and " + rhs.a + " with operator " + expr.op);
        case BinOp.Is:
          if (lhs.a.tag === "object") {
            return {
              ...expr,
              a: { tag: "primitive", name: "bool" },
              lhs: lhs,
              rhs: rhs
            };
          }
          throw new Error("TypeError: Cannot operate " + lhs.a + " and " + rhs.a + " with operator " + expr.op);
        default:
          // @ts-ignore
          throw new Error("TypeError: Unknown operator " + expr.op);
      }
    case "call":
      const typedArgs = expr.args.map(arg => typeCheckExpr(arg, refEnv));
      const typedArgsType = typedArgs.map(arg => arg.a);
      // Constructor or Normal function
      // ex. A()
      // ex. a()
      if (expr.obj === null) {
        // Constructor
        if (refEnv.class.has(expr.name)) {
          // TODO: check the number of arguments for constructor
          return {
            a: { tag: "object", name: expr.name },
            tag: "constructor",
            args: typedArgs,
            name: expr.name
          }
        }
        // Normal function call
        const funcName = funcNameMangling(expr.name, "", typedArgsType)
        if (!refEnv.func.has(funcName)) {
          throw new Error(`ReferenceError: Undefined function ${funcName}`);
        }
        return {
          ...expr,
          a: refEnv.func.get(funcName)[1],
          args: typedArgs
        };
      }
      // Method call
      // ex. A.b()
      // ex. (A.a()).b()
      else {
        const typedObj = typeCheckExpr(expr.obj, refEnv);
        if (typedObj.a.tag !== "object") {
          throw new Error("TypeError: Cannot call method on non-object: " + typedObj.a.name);
        }
        // Add self as first argument
        typedArgsType.unshift(typedObj.a);

        const funcName = funcNameMangling(expr.name, typedObj.a.name, typedArgsType)
        if (!refEnv.mangledFuncs.has(funcName)) {
          throw new Error(`ReferenceError: Undefined function ${funcName}`);
        }
        return {
          ...expr,
          a: refEnv.func.get(funcName)[1],
          obj: typedObj,
          args: typedArgs
        }
      }
    // const funcType = refEnv.func.get(funcName);
    // typedArgsType.forEach((argType, i) => {
    //   if (!isEqualType(funcType[0][i], argType)) {
    //     throw new Error(`TypeError: Function ${funcName} expects argument ${i} to be ${funcType[0][i]}, but ${argType} given`);
    //   }
    // });
    default:
      // @ts-ignore
      throw new Error("TypeError: Unknown expression " + expr.tag);
  }
}

export function typeCheckLiteral(lit: Literal<null>): Literal<Type> {
  switch (lit.tag) {
    case "number":
      return {
        ...lit,
        a: { tag: "primitive", name: "int" }
      };
    case "bool":
      return {
        ...lit,
        a: { tag: "primitive", name: "bool" }
      };
    case "none":
    default:
      return {
        ...lit,
        a: { tag: "object", name: "None" }
      };
  }
}