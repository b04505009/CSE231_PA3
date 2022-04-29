import { run } from '../runner';
import { expect } from 'chai';
import 'mocha';

const importObject = {
  imports: {
    // we typically define print to mean logging to the console. To make testing
    // the compiler easier, we define print so it logs to a string object.
    //  We can then examine output to see what would have been printed in the
    //  console.
    print: (arg: any) => {
      importObject.output += arg;
      importObject.output += "\n";
      return arg;
    },
    print_num: (arg: any) => {
      importObject.output += arg;
      importObject.output += "\n";
      return arg;
    },
    print_bool: (arg: any) => {
      importObject.output += arg === 1 ? "True" : "False";
      importObject.output += "\n";
      return arg;
    },
    print_none: (arg: any) => {
      importObject.output += "None";
      importObject.output += "\n";
      return arg;
    },
    abs: Math.abs,
    max: Math.max,
    min: Math.min,
    pow: Math.pow
  },

  output: ""
};

// Clear the output before every test
beforeEach(function () {
  importObject.output = "";
});

// We write end-to-end tests here to make sure the compiler works as expected.
// You should write enough end-to-end tests until you are confident the compiler
// runs as expected. 
describe('run(source, config) function', () => {
  const config = { importObject };

  // We can test the behavior of the compiler in several ways:
  // 1- we can test the return value of a program
  // Note: since run is an async function, we use await to retrieve the 
  // asynchronous return value. 
  it('returns the right number', async () => {
    const result = await run("987", config);
    expect(result).to.equal(987);
  });

  // 2- we can test the behavior of the compiler by also looking at the log 
  // resulting from running the program
  it('prints something right', async () => {
    var result = await run("print(1337)", config);
    expect(config.importObject.output).to.equal("1337\n");
  });

  // 3- we can also combine both type of assertions, or feel free to use any 
  // other assertions provided by chai.
  it('prints two numbers but returns last one', async () => {
    var result = await run("print(987)", config);
    expect(result).to.equal(987);
    result = await run("print(123)", config);
    expect(result).to.equal(123);

    expect(config.importObject.output).to.equal("987\n123\n");
  });

  // Note: it is often helpful to write tests for a functionality before you
  // implement it. You will make this test pass!
  it('adds two numbers', async () => {
    const result = await run("2 + 3", config);
    expect(result).to.equal(5);
  });

  // TODO: add additional tests here to ensure the compiler runs as expected
  it('test 1', async () => {
    const result = await run(`
x:int = 1
if x == 2:
    pass
else:
    x = x+1
x
    `, config);
    expect(result).to.equal(2);
  });

  it('test 2', async () => {
    const result = await run(`
x:int = 1
while x < 5:
    x = x*(1+x)
x
      `, config);
    expect(result).to.equal(6);
  });


  it('test 3', async () => {
    const result = await run(`
def f(x:int, y:int)->int:
    x = 1+y
    return x+y
f(1,5)
      `, config);
    expect(result).to.equal(11);
  });

  it('test 4', async () => {
    var result;
    var err;
    try {
      result = await run(`
x:int = 1
def f():
  x = 2
x
        `, config);
    }
    catch (e) {
      err = e.message;
    }
    expect(err).to.equal("TYPE ERROR: Cannot assign to non-local variable x");
  });

  it('test 5', async () => {
    const result = await run(`
x:int = 1
def f()->int:
  y:int = 1
  y = 1+x
  return y
f()
      `, config);
    expect(result).to.equal(2);
  });

  it('test 6', async () => {
    const result = await run(`
x:int = 1
def f()->int:
  f:int = 1
  f = 1+x
  return f
f()
      `, config);
    expect(result).to.equal(2);
  });

  it('test 7', async () => {
    const result = await run(`
x:int = 5
def f(x:int)->int:
    if x < 2:
        return 1
    return f(x-1) + f(x-2)
f(x)
      `, config);
    expect(result).to.equal(8);
  });

  it('test 8', async () => {
    const result = await run(`
x:int = 5
def f(x:int)->int:
    if x == 0:
        return 1
    elif x == 1:
        return 1
    else:
        return f(x-1) + f(x-2)
f(x)
      `, config);
    expect(result).to.equal(8);
  });


  it('test 9', async () => {
    const result = await run(`
x:int = 5
def f(x:int)->int:
    if x == 0:
        return 1
    if x == 1:
        return 1
    else:
        return f(x-1) + f(x-2)
f(x)
      `, config);
    expect(result).to.equal(8);
  });

  it('test 10', async () => {
    const result = await run(`
x:int = 5
def f(x:int)->int:
    if x == 0:
        return 1
    return x
f(x)
      `, config);
    expect(result).to.equal(5);
  });

  it('test 11', async () => {
    var result;
    var err;
    try {
      result = await run(`
x:int = 5
def f(x:int)->int:
    if x == 0:
        return 1
    if x == 1:
        return None
    else:
        return False
f(x)
        `, config);
    }
    catch (e) {
      err = e.message;
    }
    expect(err).to.equal("TYPE ERROR: Cannot return value of type None from function with return type int");
  });

  it('test 12', async () => {
    var result;
    var err;
    try {
      result = await run(`
x:int = 5
def f(x:int)->bool:
    return False
x = f(x)
        `, config);
    }
    catch (e) {
      err = e.message;
    }
    expect(err).to.equal("TYPE ERROR: Cannot assign value of type bool to variable x of type int");
  });

  it('test 13', async () => {
    var result;
    var err;
    try {
      result = await run(`
x:int = 5
def f(x:int):
    return
x = f(x)
        `, config);
    }
    catch (e) {
      err = e.message;
    }
    expect(err).to.equal("TYPE ERROR: Cannot assign value of type None to variable x of type int");
  });

  it('test 14', async () => {
    const result = await run(`
x:int = 5
def f(x:int):
    return
f(x)
      `, config);
    expect(result).to.equal(0);
  });

  it('test 15', async () => {
    var result;
    var err;
    try {
      result = await run(`
x:int = 5
def f(x:int)->int:
    if x == 0:
        return x
        x = 2
    else:
        return x+1
f(0)
    `, config);
    }
    catch (e) {
      err = e.message;
    }
    expect(err).to.equal("TYPE ERROR: Should not have statement after return");
  });

  it('test 16', async () => {
    var result;
    var err;
    try {
      result = await run(`
x:int = 5
def f(x:int)->int:
    if x == 0:
        return 1
    else:
        pass
        `, config);
    }
    catch (e) {
      err = e.message;
    }
    expect(err).to.equal("TYPE ERROR: All paths in this method / function must have a return value: f");
  });

  it('test 17', async () => {
    var result;
    var err;
    try {
      result = await run(`
x:int = 5
def f(x:int)->int:
  if x == 0:
    return 1
  else:
    if x == 1:
      pass
    else:
      return x
`, config);
    }
    catch (e) {
      err = e.message;
    }
    expect(err).to.equal("TYPE ERROR: All paths in this method / function must have a return value: f");
  });

  it('test 18', async () => {
    const result = await run(`
x:int = 4
def f(x:int)->int:
  while x < 10:
    if x == 4:
      x = x + 1
    else:
      return x
  return x
f(x)
      `, config);
    expect(result).to.equal(5);
  });


  //   it('test 20', async () => {
  //     const result = await run(`
  // def even(n:int)->bool:
  //     if n == 0:
  //         return True
  //     else:
  //         return odd(abs(n)-1)

  // def odd(n:int)->bool:
  //     if n == 0:
  //         return False
  //     else:
  //         return even(abs(n)-1)

  // even(5)
  //       `, config);
  //     expect(result).to.equal(0);
  //   });

});
