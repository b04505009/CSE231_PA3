import { run } from './runner';

function webStart() {
  document.addEventListener("DOMContentLoaded", function () {
    var importObject = {
      imports: {
        print_num: (arg: any) => {
          console.log("Logging from WASM: ", arg);
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg;
          return arg;
        },
        print_bool: (arg: any) => {
          console.log("Logging from WASM: ", arg);
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = arg === 1 ? "True" : "False";
          return arg;
        },
        print_none: (arg: any) => {
          console.log("Logging from WASM: ", arg);
          const elt = document.createElement("pre");
          document.getElementById("output").appendChild(elt);
          elt.innerText = "None";
          return arg;
        },
        abs: Math.abs,
        max: Math.max,
        min: Math.min,
        pow: Math.pow
      },
    };

    function renderResult(result: any): void {
      if (result === undefined) { console.log("skip"); return; }
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.innerText = String(result);
    }

    function renderError(result: any): void {
      const elt = document.createElement("pre");
      document.getElementById("output").appendChild(elt);
      elt.setAttribute("style", "color: red");
      elt.innerText = String(result);
    }

    document.getElementById("run").addEventListener("click", function (e) {
      const source = document.getElementById("user-code") as HTMLTextAreaElement;
      const output = document.getElementById("output").innerHTML = "";
      run(source.value, { importObject }).then((r) => {
        renderResult(r);
        console.log("run finished")
      }).catch((e) => {
        renderError(e);
        console.log("run failed", e)
      });;
    });
  });
}

webStart();
