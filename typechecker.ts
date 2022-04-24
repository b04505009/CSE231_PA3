import { Body, Type, Expr, Stmt, Literal, BinOp, VarInit, FuncDef, TypedVar, isEqualType, isEqualPrimitiveType } from "./ast";

type TypeEnv = {
  var: Map<string, Type>;
  func: Map<string, [Type[], Type]>;
  ret?: Type;
}

export function typeCheckProgram(prog: Body<null>): Body<Type> {
  const globalEnv: TypeEnv = {
    var: new Map(),
    func: new Map(),
  }
  const typedProg: Body<Type> = {
    varinits: [],
    stmts: [],
    funcdefs: [],
  }

  // console.log("typeCheckProgram:", prog)
  
  typedProg.varinits = typeCheckVarInits(prog.varinits);
  prog.varinits.forEach(varinit => {
    globalEnv.var.set(varinit.name, varinit.type);
  });
  prog.funcdefs.forEach(funcdef => {
    if (globalEnv.var.has(funcdef.name) || globalEnv.func.has(funcdef.name)) {
      throw new Error("ReferenceError: Duplicate declaration of identifier in same scope: " + funcdef.name);
    }
    globalEnv.func.set(funcdef.name, [funcdef.params.map(param => param.type), funcdef.ret]);
  });
  prog.funcdefs.forEach(funcdef => {
    typedProg.funcdefs.push(typeCheckFuncDef(funcdef, globalEnv));
  });
  if (checkReturn(prog.stmts)) {
    throw new Error("TypeError: Return Statement cannot appear at the top level");
  }
  typedProg.stmts = typeCheckStmts(prog.stmts, globalEnv, {var: new Map(), func: new Map()});
  return typedProg;
}

export function typeCheckStmts(stmts: Stmt<null>[], localEnv: TypeEnv, nonLocalEnv: TypeEnv): Stmt<Type>[] {
  // If multiple maps have the same key, the value of the merged map will be the value of the last merging map with that key.
  const refEnv: TypeEnv = {
    var: new Map([...nonLocalEnv.var, ...localEnv.var]),
    func: new Map([...nonLocalEnv.func, ...localEnv.func]),
    ret: localEnv.ret,
  }
  
  const typedStmts: Stmt<Type>[] = [];
  stmts.forEach(stmt => {

    // console.log("typeCheckStmts: ", stmt)

    switch (stmt.tag) {
      case "assign":
        if (!localEnv.var.has(stmt.name)) {
          if (!nonLocalEnv.var.has(stmt.name)){
            throw new Error("ReferenceError: Undefined variable " + stmt.name);
          }
          throw new Error("ReferenceError: Cannot assign to non-local variable " + stmt.name);
        }
        const typedValue = typeCheckExpr(stmt.value, refEnv);
        if (!isEqualType(typedValue.a, refEnv.var.get(stmt.name))) {
          throw new Error(`TypeError: Cannot assign value of type ${typedValue.a.name} to variable ${stmt.name} of type ${refEnv.var.get(stmt.name).name}`);
        }
        typedStmts.push({ ...stmt, a: { tag: "object", name: "NoneType" } });
        break;
      case "return":
        const typedRet = typeCheckExpr(stmt.ret, refEnv);
        if (!isEqualType(typedRet.a, refEnv.ret)) {
          throw new Error(`TypeError: Cannot return value of type ${typedRet.a.name} from function with return type ${refEnv.ret.name}`);
        }
        typedStmts.push({ ...stmt, a: typedRet.a, ret: typedRet });
        return typedStmts;
      case "if":
        const typedCond_if = typeCheckExpr(stmt.cond, refEnv);
        if (!isEqualPrimitiveType(typedCond_if.a, "Bool")) {
          throw new Error(`TypeError: Cannot use value of type ${typedCond_if.a.name} as condition`);
        }
        const typedThen = typeCheckStmts(stmt.then, localEnv, nonLocalEnv);
        const typedElse = typeCheckStmts(stmt.else, localEnv, nonLocalEnv);
        typedStmts.push({ ...stmt, a: { tag: "object", name: "NoneType" }, cond: typedCond_if, then: typedThen, else: typedElse });
        break;
      case "while":
        const typedCond_while = typeCheckExpr(stmt.cond, refEnv);
        if (!isEqualPrimitiveType(typedCond_while.a, "Bool")) {
          throw new Error(`TypeError: Cannot use value of type ${typedCond_while.a} as condition`);
        }
        const typedLoop = typeCheckStmts(stmt.loop, localEnv, nonLocalEnv);
        typedStmts.push({ ...stmt, a: { tag: "object", name: "NoneType" }, cond: typedCond_while, loop: typedLoop });
        break;
      case "pass":
        typedStmts.push({ ...stmt, a: { tag: "object", name: "NoneType" } });
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



export function typeCheckFuncDef(def: FuncDef<null>, nonLocalEnv: TypeEnv): FuncDef<Type> {
  const localEnv: TypeEnv = { 
    var: new Map(),
    func: new Map(),
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
  if (!isEqualType(def.ret, { tag: "object", name: "NoneType" }) && !checkReturn(typedStmts)) {
    throw new Error("TypeError: All paths in this method / function must have a return value: " + def.name);
  } 
  // If return type is none, add a return statement if there isn't one
  if (isEqualType(def.ret, { tag: "object", name: "NoneType" }) && !checkReturn(typedStmts)) {
    typedStmts.push({ tag: "return", ret: { tag: "literal", a: { tag: "object", name: "NoneType" }, value: {tag: "none" } } });
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
          if (isEqualPrimitiveType(lhs.a, "Int")) {
            return {
              ...expr,
              a: { tag: "primitive", name: "Bool" },
              lhs: lhs,
              rhs: rhs
            };
          }
          if (isEqualPrimitiveType(lhs.a, "Bool")) {
            return {
              ...expr,
              a: { tag: "primitive", name: "Bool" },
              lhs: lhs,
              rhs: rhs
            };
          }
          throw new Error("TypeError: Cannot operate " + lhs.a + " and " + rhs.a + " with operator " + expr.op);
        case BinOp.Lt:
        case BinOp.Le:
        case BinOp.Gt:
        case BinOp.Ge:
          if (isEqualPrimitiveType(lhs.a, "Int")) {
            return {
              ...expr,
              a: { tag: "primitive", name: "Bool" },
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
          if (isEqualPrimitiveType(lhs.a, "Int")) {
            return {
              ...expr,
              a: { tag: "primitive", name: "Int" },
              lhs: lhs,
              rhs: rhs
            };
          }
          throw new Error("TypeError: Cannot operate " + lhs.a + " and " + rhs.a + " with operator " + expr.op);
        case BinOp.Is:
          if (lhs.a.tag === "object") {
            return {
              ...expr,
              a: { tag: "primitive", name: "Bool" },
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
      // Check if function exists
      if (!refEnv.func.has(expr.name)) {
        throw new Error(`ReferenceError: Undefined function ${expr.name}`);
      }
      // Check if function has correct number of arguments
      const func = refEnv.func.get(expr.name);
      if (func[0].length !== expr.args.length) {
        throw new Error(`TypeError: Function ${expr.name} expects ${func[0].length} arguments, but ${expr.args.length} given`);
      }
      // Check if arguments are of correct type
      const typedArgs = expr.args.map(arg => typeCheckExpr(arg, refEnv));
      const typedArgsType = typedArgs.map(arg => arg.a);
      typedArgsType.forEach((argType, i) => {
        if (!isEqualType(func[0][i], argType)){
          throw new Error(`TypeError: Function ${expr.name} expects argument ${i} to be ${func[0][i]}, but ${argType} given`);
        }
      });
      return {
        ...expr,
        a: func[1],
        args: typedArgs
      };
    case "builtin1":
      const typedArg = typeCheckExpr(expr.arg, refEnv);
      switch (expr.name) {
        case "print":
          // if (!isType(typedArg.a)) {
          //   throw new Error("TypeError: Cannot apply builtin1 function " + expr.name + " to type " + typedArg.a);
          // }
          return {
            ...expr,
            a: typedArg.a,
            arg: typedArg
          };
        case "abs":
          if (!isEqualPrimitiveType(typedArg.a, "Int")) {
            throw new Error("TypeError: Cannot apply builtin1 function " + expr.name + " to type " + typedArg.a);
          }
          return {
            ...expr,
            a: { tag: "primitive", name: "Int" },
            arg: typedArg
          };
        }
      throw new Error("TypeError: Unknown builtin1 function " + expr.name);
    case "builtin2":
      const typedArg1 = typeCheckExpr(expr.arg1, refEnv);
      const typedArg2 = typeCheckExpr(expr.arg2, refEnv);
      switch (expr.name) {
        case "min":
        case "max":
        case "pow":
          if (!isEqualPrimitiveType(typedArg1.a, "Int") || !isEqualPrimitiveType(typedArg2.a, "Int")) {
            throw new Error("TypeError: Cannot apply builtin2 function " + expr.name + " to type " + typedArg1.a + " and " + typedArg2.a);
          }
          return {
            ...expr,
            a: { tag: "primitive", name: "Int" },
            arg1: typedArg1,
            arg2: typedArg2
          };
        default:
          throw new Error("TypeError: Unknown builtin2 function " + expr.name);
      }
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
        a: { tag: "primitive", name: "Int" }
      };
    case "bool":
      return {
        ...lit,
        a: { tag: "primitive", name: "Bool" }
      };
    case "none":
    default:
      return {
        ...lit,
        a: { tag: "object", name: "NoneType" }
      };
  }
}