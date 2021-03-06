var assert = require("assert");
var terser = require("../node");

describe("Export/Import", function() {
    it("Should parse export directives", function() {
        var inputs = [
            ['export * from "a.js"', ['*'], "a.js"],
            ['export {A} from "a.js"', ['A'], "a.js"],
            ['export {A as X} from "a.js"', ['X'], "a.js"],
            ['export {A as Foo, B} from "a.js"', ['Foo', 'B'], "a.js"],
            ['export {A, B} from "a.js"', ['A', 'B'], "a.js"],
        ];

        function test(code) {
            return terser.parse(code);
        }

        function extractNames(symbols) {
            var ret = [];
            for (var i = 0; i < symbols.length; i++) {
                ret.push(symbols[i].foreign_name.name);
            }
            return ret;
        }

        for (var i = 0; i < inputs.length; i++) {
            var ast = test(inputs[i][0]);
            var names = inputs[i][1];
            var filename = inputs[i][2];
            assert(ast instanceof terser.AST_Toplevel);
            assert.equal(ast.body.length, 1);
            var st = ast.body[0];
            assert(st instanceof terser.AST_Export);
            var actualNames = extractNames(st.exported_names);
            assert.deepEqual(actualNames, names);
            assert.equal(st.module_name.value, filename);
        }
    });

    it("Should not parse invalid uses of export", function() {
        assert.equal(terser.minify("export").error.message, "Unexpected token: eof (undefined)");
        assert.equal(terser.minify("export;").error.message, "Unexpected token: punc (;)");
        assert.equal(terser.minify("export();").error.message, "Unexpected token: keyword (export)");
        assert.equal(terser.minify("export(1);").error.message, "Unexpected token: keyword (export)");
        assert.equal(terser.minify("var export;").error.message, "Name expected");
        assert.equal(terser.minify("var export = 1;").error.message, "Name expected");
        assert.equal(terser.minify("function f(export){}").error.message, "Invalid function parameter");
    });

    it("Should not parse invalid uses of import", function() {
        assert.equal(terser.minify("import").error.message, "Unexpected token: eof (undefined)");
        assert.equal(terser.minify("import;").error.message, "Unexpected token: punc (;)");
        assert.equal(terser.minify("var import;").error.message, "Unexpected token: import");
        assert.equal(terser.minify("var import = 1;").error.message, "Unexpected token: import");
        assert.equal(terser.minify("function f(import){}").error.message, "Unexpected token: name (import)");
    });
});
