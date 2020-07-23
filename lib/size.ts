import {
    AST_Node,
    AST_Symbol,
    walk_parent
} from "./ast";
import { default_options } from "../tools/node";

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

AST_Symbol.prototype._size = function (): number {
    return !mangle_options || this.definition().unmangleable(mangle_options)
        ? this.name.length
        : 2;
};
