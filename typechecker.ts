import { Body, Type, Expr, Stmt, Literal, BinOp, VarInit, FuncDef, NoneType, ClassDef, isEqualType, isEqualPrimitiveType } from "./ast";

type TypeEnv = {
  var?: Map<string, Type>;
  func?: Map<string, [Type[], Type]>;
  mangledFuncs?: Set<string>;
  class?: Map<string, TypeEnv>;
  ret?: Type;
}

const globalEnv: TypeEnv = {
  var: new Map(),
  func: new Map(),
  mangledFuncs: new Set(),
  class: new Map(),
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
    });

    // TODO: For class in class, we have to add all the members and methods of all the subclasses recursively

    // Add varinits to globalEnv.class[classdef.name].var
    classdef.body.varinits.forEach(varinit => {
      checkDuplicateID(varinit.name, [globalEnv.class.get(classdef.name).var]);
      globalEnv.class.get(classdef.name).var.set(varinit.name, varinit.type);
    } );

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

  // Check varinits
  typedProg.varinits = typeCheckVarInits(prog.varinits);
  // Check funcdefs
  prog.funcdefs.forEach(funcdef => {
    typedProg.funcdefs.push(typeCheckFuncDef(funcdef, globalEnv));
  });
  // Check classdefs
  prog.classdefs.forEach(classdef => {
    typedProg.classdefs.push(typeCheckClassDef(classdef));
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
export function typeCheckClassDef(classdef: ClassDef<null>): ClassDef<Type> {

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
  methodDefs.forEach(funcdef => {
    typedClass.funcdefs.push(typeCheckFuncDef(funcdef, globalEnv));
  });
  
  return { ...classdef, body: typedClass};
}

export function typeCheckStmts(stmts: Stmt<null>[], localEnv: TypeEnv, nonLocalEnv: TypeEnv): Stmt<Type>[] {
  // If multiple maps have the same key, the value of the merged map will be the value of the last merging map with that key.
  const refEnv: TypeEnv = {
    var: new Map([...nonLocalEnv.var, ...localEnv.var]),
    func: new Map([...nonLocalEnv.func, ...localEnv.func]),
    class: new Map([...nonLocalEnv.class, ...localEnv.class]),
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
    if (!isEqualType(typedInit.a, init.type)) {
      throw new Error("Type error: Init type " + init.type.name + " does not match type " + typedInit.a.name);
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

  switch (expr.tag) {
    case "literal":
      const lit = typeCheckLiteral(expr.value);
      return {
        ...expr,
        a: lit.a
      };
    case "id":
      if (!refEnv.var.has(expr.name) && !refEnv.func.has(expr.name)) {
        throw new Error(`ReferenceError: Undefined variable ${expr.name}`);
      }
      if (refEnv.var.has(expr.name)) {
        return {
          ...expr,
          a: refEnv.var.get(expr.name)
        };
      }
      if (refEnv.func.has(expr.name)) {
        return {
          ...expr,
          a: refEnv.func.get(expr.name)[1]
        };
      }
      throw new Error(`ReferenceError: Redefined variable ${expr.name}`);
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
      if (expr.func.tag !== "id") {
        throw new Error("TypeError: Function name must be an identifier");
      }
      const typedArgs = expr.args.map(arg => typeCheckExpr(arg, refEnv));
      const typedArgsType = typedArgs.map(arg => arg.a);
      if (expr.func.obj === undefined || expr.func.obj === null) {
        const funcName = funcNameMangling(expr.func.name, "", typedArgsType)
        if (!refEnv.func.has(funcName)) {
          throw new Error(`ReferenceError: Undefined function ${funcName}`);
        }
        return {
          ...expr,
          a: refEnv.func.get(funcName)[1],
          func: { tag: "id", name: funcName },
          args: typedArgs
        }
      }
      else {
        if (expr.func.obj.tag !== "id") {
          throw new Error("TypeError: object calling function must be an identifier");
        }
        const funcName = funcNameMangling(expr.func.name, expr.func.obj.name, typedArgsType)
        if (!refEnv.func.has(funcName)) {
          throw new Error(`ReferenceError: Undefined function ${funcName}`);
        }
        return {
          ...expr,
          a: refEnv.func.get(funcName)[1],
          func: { tag: "id", name: funcName },
          args: typedArgs
        }
      }
    // Check if function has correct number of arguments
    // const funcType = refEnv.func.get(funcName);
    // if (funcType[0].length !== expr.args.length) {
    //   throw new Error(`TypeError: Function ${funcName} expects ${funcType[0].length} arguments, but ${expr.args.length} given`);
    // }
    // Check if arguments are of correct type
    // const typedArgs = expr.args.map(arg => typeCheckExpr(arg, refEnv));
    // const typedArgsType = typedArgs.map(arg => arg.a);
    // typedArgsType.forEach((argType, i) => {
    //   if (!isEqualType(funcType[0][i], argType)) {
    //     throw new Error(`TypeError: Function ${funcName} expects argument ${i} to be ${funcType[0][i]}, but ${argType} given`);
    //   }
    // });
    // return {
    //   ...expr,
    //   a: funcType[1],
    //   args: typedArgs
    // };
    // case "builtin1":
    //   const typedArg = typeCheckExpr(expr.arg, refEnv);
    //   switch (expr.name) {
    //     case "print":
    //       // if (!isType(typedArg.a)) {
    //       //   throw new Error("TypeError: Cannot apply builtin1 function " + expr.name + " to type " + typedArg.a);
    //       // }
    //       return {
    //         ...expr,
    //         a: typedArg.a,
    //         arg: typedArg
    //       };
    //     case "abs":
    //       if (!isEqualPrimitiveType(typedArg.a, "Int")) {
    //         throw new Error("TypeError: Cannot apply builtin1 function " + expr.name + " to type " + typedArg.a);
    //       }
    //       return {
    //         ...expr,
    //         a: { tag: "primitive", name: "Int" },
    //         arg: typedArg
    //       };
    //   }
    //   throw new Error("TypeError: Unknown builtin1 function " + expr.name);
    // case "builtin2":
    //   const typedArg1 = typeCheckExpr(expr.arg1, refEnv);
    //   const typedArg2 = typeCheckExpr(expr.arg2, refEnv);
    //   switch (expr.name) {
    //     case "min":
    //     case "max":
    //     case "pow":
    //       if (!isEqualPrimitiveType(typedArg1.a, "Int") || !isEqualPrimitiveType(typedArg2.a, "Int")) {
    //         throw new Error("TypeError: Cannot apply builtin2 function " + expr.name + " to type " + typedArg1.a + " and " + typedArg2.a);
    //       }
    //       return {
    //         ...expr,
    //         a: { tag: "primitive", name: "Int" },
    //         arg1: typedArg1,
    //         arg2: typedArg2
    //       };
    //     default:
    //       throw new Error("TypeError: Unknown builtin2 function " + expr.name);
    //   }
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