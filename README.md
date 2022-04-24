# PA3

## Language Specification

```
program := <var_def | class_def>* <stmt>*
class_def := class <name>(object):
                  <var_def | method_def>+
var_def := <typed_var> = <literal>
typed_var := <name> : <type>
method_def := def <name>(self: <type> [, <typed_var>]*) [-> <type>]?: <method_body>
method_body := <var_def>* <stmt>+
stmt := <name> = <expr>
      | <expr>.<name> = <expr>
      | if <expr>: <stmt>+ else: <stmt>+
      | return <expr>?
      | <expr>
      | pass
expr := <literal>
      | <name>
      | <uniop> <expr>
      | <expr> <binop> <expr>
      | ( <expr> ) 
      | print(<expr>)
      | <name>()
      | <expr>.<name>
      | <expr>.<name>([<expr> [, <expr>]*]?)
uniop := not | -
binop := + | - | * | // | % | == | != | <= | >= | < | > | is
literal := None
         | True
         | False
         | <number>
type := int | bool | <name>
number := 32-bit integer literals
name := Python identifiers other than `print` or keywords
```