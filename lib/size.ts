import {
    AST_Accessor,
    AST_Arrow,
    AST_Block,
    AST_Debugger,
    AST_Defun,
    AST_Directive,
    AST_Export,
    AST_Function,
    AST_Import,
    AST_Node,
    AST_Object,
    AST_Symbol,
    AST_Toplevel,
    walk_parent
} from "./ast";
import { default_options } from "../tools/node";
import { first_in_statement } from "./utils/first_in_statement";

let mangle_options = undefined;
AST_Node.prototype.size = function (compressor, stack) {
    mangle_options = (default_options as any).mangle;

    let size = 0;
    walk_parent(this, (node, info) => {
        size += node._size(info);
    }, stack || (compressor && compressor.stack));

    // just to save a bit of memory
    mangle_options = undefined;

    return size;
};

AST_Node.prototype._size = () => 0;

AST_Debugger.prototype._size = () => 8;

AST_Directive.prototype._size = function (): number {
    // TODO string encoding stuff
    return 2 + this.value.length;
};

const list_overhead = (array) => array.length && array.length - 1;

AST_Block.prototype._size = function () {
    return 2 + list_overhead(this.body);
};

AST_Toplevel.prototype._size = function() {
    return list_overhead(this.body);
};

/*#__INLINE__*/
const lambda_modifiers = func =>
    (func.is_generator ? 1 : 0) + (func.async ? 6 : 0);

AST_Accessor.prototype._size = function () {
    return lambda_modifiers(this) + 4 + list_overhead(this.argnames) + list_overhead(this.body);
};

AST_Function.prototype._size = function (info) {
    const first: any = !!first_in_statement(info);
    return (first * 2) + lambda_modifiers(this) + 12 + list_overhead(this.argnames) + list_overhead(this.body);
};

AST_Defun.prototype._size = function () {
    return lambda_modifiers(this) + 13 + list_overhead(this.argnames) + list_overhead(this.body);
};

AST_Arrow.prototype._size = function (): number {
    let args_and_arrow = 2 + list_overhead(this.argnames);

    if (
        !(
            this.argnames.length === 1
            && this.argnames[0] instanceof AST_Symbol
        )
    ) {
        args_and_arrow += 2;
    }

    return lambda_modifiers(this) + args_and_arrow + (Array.isArray(this.body) ? list_overhead(this.body) : this.body._size());
};

AST_Import.prototype._size = function (): number {
    // import
    let size = 6;

    if (this.imported_name) size += 1;

    // from
    if (this.imported_name || this.imported_names) size += 5;

    // braces, and the commas
    if (this.imported_names) {
        size += 2 + list_overhead(this.imported_names);
    }

    return size;
};

AST_Export.prototype._size = function (): number {
    let size = 7 + (this.is_default ? 8 : 0);

    if (this.exported_value) {
        size += this.exported_value._size();
    }

    if (this.exported_names) {
        // Braces and commas
        size += 2 + list_overhead(this.exported_names);
    }

    if (this.module_name) {
        // "from "
        size += 5;
    }

    return size;
};

AST_Object.prototype._size = function (info): number {
    let base = 2;
    if (first_in_statement(info)) {
        base += 2; // parens
    }
    return base + list_overhead(this.properties);
};

AST_Symbol.prototype._size = function (): number {
    return !mangle_options || this.definition().unmangleable(mangle_options)
        ? this.name.length
        : 2;
};
