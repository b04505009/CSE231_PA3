1. Give three examples of Python programs that use binary operators and/or builtins from this PA, but have different behavior than your compiler. For each, write:
    - a sentence about why that is
    - a sentence about what you might do to extend the compiler to support it
    (1) print(1000000000000000)
        - Since the number type are limited to i32, for large number it will overflow
        - Support larger number type like i64, and automatically upcast to needed type like Python do
    (2) abs(print(100))
        - In our definition, print() would return its argument in i32, but for Python it would return NoneType
        - Support NoneType and change our print function definition
    (3) pow(2, 1-2)
        - pow(2, 1-2) should be 0.5, but we only support i32, so it will just cast to 0
        - Support floating point number NoneType
2. What resources did you find most helpful in completing the assignment?
    (1) TA's video
    (2) Piazza
    (3) WeChat course group
3. Who (if anyone) in the class did you work with on the assignment?
    (1) Lien-Bee Huang
    (2) Someone in the WeChat course group