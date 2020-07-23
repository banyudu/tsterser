import {
    AST_Accessor,
    AST_Array,
    AST_Arrow,
    AST_Binary,
    AST_Block,
    AST_Call,
    AST_Case,
    AST_Class,
    AST_ClassProperty,
    AST_ConciseMethod,
    AST_Conditional,
    AST_Const,
    AST_Debugger,
    AST_Default,
    AST_Defun,
    AST_Destructuring,
    AST_Directive,
    AST_Dot,
    AST_Export,
    AST_Function,
    AST_Import,
    AST_Let,
    AST_NameMapping,
    AST_New,
    AST_Node,
    AST_Object,
    AST_ObjectKeyVal,
    AST_ObjectGetter,
    AST_ObjectSetter,
    AST_Sequence,
    AST_Sub,
    AST_Switch,
    AST_Symbol,
    AST_SymbolClassProperty,
    AST_SymbolRef,
    AST_TemplateSegment,
    AST_TemplateString,
    AST_Toplevel,
    AST_Try,
    AST_Catch,
    AST_Finally,
    AST_Unary,
    AST_Var,
    AST_VarDef,
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

AST_Destructuring.prototype._size = () => 2;

AST_TemplateString.prototype._size = function (): number {
    return 2 + (Math.floor(this.segments.length / 2) * 3);  /* "${}" */
};

AST_TemplateSegment.prototype._size = function (): number {
    return this.value.length;
};

AST_Switch.prototype._size = function (): number {
    return 8 + list_overhead(this.body);
};

AST_Case.prototype._size = function (): number {
    return 5 + list_overhead(this.body);
};

AST_Default.prototype._size = function (): number {
    return 8 + list_overhead(this.body);
};

AST_Try.prototype._size = function (): number {
    return 3 + list_overhead(this.body);
};

AST_Catch.prototype._size = function (): number {
    let size = 7 + list_overhead(this.body);
    if (this.argname) {
        size += 2;
    }
    return size;
};

AST_Finally.prototype._size = function (): number {
    return 7 + list_overhead(this.body);
};

/*#__INLINE__*/
const def_size = (size, def) => size + list_overhead(def.definitions);

AST_Var.prototype._size = function (): number {
    return def_size(4, this);
};

AST_Let.prototype._size = function (): number {
    return def_size(4, this);
};

AST_Const.prototype._size = function (): number {
    return def_size(6, this);
};

AST_VarDef.prototype._size = function (): number {
    return this.value ? 1 : 0;
};

AST_NameMapping.prototype._size = function (): number {
    // foreign name isn't mangled
    return this.name ? 4 : 0;
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

AST_Call.prototype._size = function (): number {
    return 2 + list_overhead(this.args);
};

AST_New.prototype._size = function (): number {
    return 6 + list_overhead(this.args);
};

AST_Sequence.prototype._size = function (): number {
    return list_overhead(this.expressions);
};

AST_Dot.prototype._size = function (): number {
    return this.property.length + 1;
};

AST_Sub.prototype._size = () => 2;

AST_Unary.prototype._size = function (): number {
    if (this.operator === "typeof") return 7;
    if (this.operator === "void") return 5;
    return this.operator.length;
};

AST_Binary.prototype._size = function (info): number {
    if (this.operator === "in") return 4;

    let size = this.operator.length;

    if (
        (this.operator === "+" || this.operator === "-")
        && this.right instanceof AST_Unary && this.right.operator === this.operator
    ) {
        // 1+ +a > needs space between the +
        size += 1;
    }

    if (this.needs_parens(info)) {
        size += 2;
    }

    return size;
};

AST_Conditional.prototype._size = () => 3;

AST_Array.prototype._size = function (): number {
    return 2 + list_overhead(this.elements);
};

AST_Object.prototype._size = function (info): number {
    let base = 2;
    if (first_in_statement(info)) {
        base += 2; // parens
    }
    return base + list_overhead(this.properties);
};

/*#__INLINE__*/
const key_size = key =>
    typeof key === "string" ? key.length : 0;

AST_ObjectKeyVal.prototype._size = function (): number {
    return key_size(this.key) + 1;
};

/*#__INLINE__*/
const static_size = is_static => is_static ? 7 : 0;

AST_ObjectGetter.prototype._size = function (): number {
    return 5 + static_size(this.static) + key_size(this.key);
};

AST_ObjectSetter.prototype._size = function (): number {
    return 5 + static_size(this.static) + key_size(this.key);
};

AST_ConciseMethod.prototype._size = function (): number {
    return static_size(this.static) + key_size(this.key) + lambda_modifiers(this);
};

AST_Class.prototype._size = function (): number {
    return (
        (this.name ? 8 : 7)
        + (this.extends ? 8 : 0)
    );
};

AST_ClassProperty.prototype._size = function (): number {
    return (
        static_size(this.static)
        + (typeof this.key === "string" ? this.key.length + 2 : 0)
        + (this.value ? 1 : 0)
    );
};

AST_Symbol.prototype._size = function (): number {
    return !mangle_options || this.definition().unmangleable(mangle_options)
        ? this.name.length
        : 2;
};

// TODO take propmangle into account
AST_SymbolClassProperty.prototype._size = function (): number {
    return this.name.length;
};

AST_SymbolRef.prototype._size = function (): number {
    const { name, thedef } = this;

    if (thedef && thedef.global) return name.length;

    if (name === "arguments") return 9;

    return 2;
};
