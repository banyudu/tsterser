/***********************************************************************

  A JavaScript tokenizer / parser / beautifier / compressor.
  https://github.com/mishoo/UglifyJS2

  -------------------------------- (C) ---------------------------------

                           Author: Mihai Bazon
                         <mihai.bazon@gmail.com>
                       http://mihai.bazon.net/blog

  Distributed under the BSD license:

    Copyright 2012 (c) Mihai Bazon <mihai.bazon@gmail.com>

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions
    are met:

        * Redistributions of source code must retain the above
          copyright notice, this list of conditions and the following
          disclaimer.

        * Redistributions in binary form must reproduce the above
          copyright notice, this list of conditions and the following
          disclaimer in the documentation and/or other materials
          provided with the distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDER “AS IS” AND ANY
    EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
    IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
    PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER BE
    LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY,
    OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
    PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
    PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR
    TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF
    THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF
    SUCH DAMAGE.

 ***********************************************************************/

"use strict";

import {
    HOP,
    MAP,
    noop,
    string_template,
} from "./utils/index";
import { parse } from "./parse";

// return true if the node at the top of the stack (that means the
// innermost node in the current output) is lexically the first in
// a statement.
export function first_in_statement(stack: any) {
    let node = stack.parent(-1);
    for (let i = 0, p; p = stack.parent(i); i++) {
        if (p instanceof AST_Statement && p.body === node)
            return true;
        if ((p instanceof AST_Sequence && p.expressions[0] === node) ||
            (p.TYPE === "Call" && p.expression === node) ||
            (p instanceof AST_PrefixedTemplateString && p.prefix === node) ||
            (p instanceof AST_Dot && p.expression === node) ||
            (p instanceof AST_Sub && p.expression === node) ||
            (p instanceof AST_Conditional && p.condition === node) ||
            (p instanceof AST_Binary && p.left === node) ||
            (p instanceof AST_UnaryPostfix && p.expression === node)
        ) {
            node = p;
        } else {
            return false;
        }
    }
    return undefined;
}

// Returns whether the leftmost item in the expression is an object
export function left_is_object(node: any): boolean {
    if (node instanceof AST_Object) return true;
    if (node instanceof AST_Sequence) return left_is_object(node.expressions[0]);
    if (node.TYPE === "Call") return left_is_object(node.expression);
    if (node instanceof AST_PrefixedTemplateString) return left_is_object(node.prefix);
    if (node instanceof AST_Dot || node instanceof AST_Sub) return left_is_object(node.expression);
    if (node instanceof AST_Conditional) return left_is_object(node.condition);
    if (node instanceof AST_Binary) return left_is_object(node.left);
    if (node instanceof AST_UnaryPostfix) return left_is_object(node.expression);
    return false;
}

/*#__INLINE__*/
const key_size = key =>
    typeof key === "string" ? key.length : 0;

/*#__INLINE__*/
const lambda_modifiers = func =>
    (func.is_generator ? 1 : 0) + (func.async ? 6 : 0);

/*#__INLINE__*/
const static_size = is_static => is_static ? 7 : 0;

const list_overhead = (array) => array.length && array.length - 1;

/*#__INLINE__*/
const def_size = (size, def) => size + list_overhead(def.definitions);

function DEFNODE(type: string, strProps: string | null, methods: AnyObject, staticMethods: AnyObject, base: any | null) {
    let self_props = strProps ? strProps.split(/\s+/) : [];
    const name = `AST_${type}`;
    const factory = () => {
        const proto = base && Object.create(base.prototype);
        const BasicClass = base || class {};
        const obj = {
            [name]: class extends BasicClass {
                static _SUBCLASSES: any;
                initialize: any;

                CTOR = this.constructor;
                flags = 0;
                TYPE = type || undefined;

                static get SELF_PROPS() { return self_props; }
                static get SUBCLASSES () {
                    if (!this._SUBCLASSES) {
                        this._SUBCLASSES = [];
                    }
                    return this._SUBCLASSES;
                }
                static get PROPS() { return obj[name].SELF_PROPS.concat((BasicClass as any).PROPS || []); }
                static get BASE() { return proto ? base : undefined; }
                static get TYPE() { return type || undefined; }

                static DEFMETHOD (name: string, method: Function) {
                    this.prototype[name] = method;
                }

                constructor (args) {
                    super(args);
                    if (args) {
                        obj[name].SELF_PROPS.forEach(item => this[item] = args[item]);
                    }
                    this.initialize?.();
                }

            }
        };
        return obj[name];
    };
    var Node: any = factory();
    if (base) base.SUBCLASSES.push(Node);
    if (methods) for (let i in methods) if (HOP(methods, i)) {
        Node.prototype[i] = methods[i];
    }
    if (staticMethods) for (let i in staticMethods) if (HOP(staticMethods, i)) {
        Node[i] = staticMethods[i];
    }
    return Node;
}

class AST_Token {
    static _SUBCLASSES: any;
    initialize: any;
    static get SELF_PROPS() {
      return [
        "type",
        "value",
        "line",
        "col",
        "pos",
        "endline",
        "endcol",
        "endpos",
        "nlb",
        "comments_before",
        "comments_after",
        "file",
        "raw",
        "quote",
        "end",
      ];
    }
    static get SUBCLASSES() {
      if (!this._SUBCLASSES) {
        this._SUBCLASSES = [];
      }
      return this._SUBCLASSES;
    }
    static get PROPS() {
      return AST_Token.SELF_PROPS;
    }
    static get BASE() {
      return undefined;
    }
    static get TYPE() {
      return "Token";
    }
    static DEFMETHOD(name: string, method: Function) {
      this.prototype[name] = method;
    }
  
    constructor(args: any = {}) {
      if (args) {
        AST_Token.SELF_PROPS.map((item) => (this[item] = args[item]));
      }
      this.initialize?.();
    }
  }

var AST_Node: any = DEFNODE("Node", "start end", {
    _clone: function(deep: boolean) {
        if (deep) {
            var self = this.clone();
            return self.transform(new TreeTransformer(function(node: any) {
                if (node !== self) {
                    return node.clone(true);
                }
            }));
        }
        return new this.CTOR(this);
    },
    clone: function(deep: boolean) {
        return this._clone(deep);
    },
    _walk: function(visitor: any) {
        return visitor._visit(this);
    },
    walk: function(visitor: any) {
        return this._walk(visitor); // not sure the indirection will be any help
    },
    _children_backwards: () => {},
    _size: () => 0,
    size: function (compressor, stack) {
        // mangle_options = (default_options as any).mangle;

        let size = 0;
        walk_parent(this, (node, info) => {
            size += node._size(info);
        }, stack || (compressor && compressor.stack));

        // just to save a bit of memory
        // mangle_options = undefined;

        return size;
    }
}, {
    documentation: "Base class of all AST nodes",
    propdoc: {
        start: "[AST_Token] The first token of this node",
        end: "[AST_Token] The last token of this node"
    },
    warn_function: null,
    warn: function(txt, props) {
        if (AST_Node.warn_function)
            AST_Node.warn_function(string_template(txt, props));
    }
}, null);

/* -----[ statements ]----- */

var AST_Statement: any = DEFNODE("Statement", null, {}, {
    documentation: "Base class of all statements",
}, AST_Node);

var AST_Debugger: any = DEFNODE("Debugger", null, {
    _size: () => 8
}, {
    documentation: "Represents a debugger statement",
}, AST_Statement);

var AST_Directive: any = DEFNODE("Directive", "value quote", {
    _size: function (): number {
        // TODO string encoding stuff
        return 2 + this.value.length;
    }
}, {
    documentation: "Represents a directive, like \"use strict\";",
    propdoc: {
        value: "[string] The value of this directive as a plain string (it's not an AST_String!)",
        quote: "[string] the original quote character"
    },
}, AST_Statement);

var AST_SimpleStatement: any = DEFNODE("SimpleStatement", "body", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.body._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.body);
    }
}, {
    documentation: "A statement consisting of an expression, i.e. a = 1 + 2",
    propdoc: {
        body: "[AST_Node] an expression node (should not be instanceof AST_Statement)"
    },
}, AST_Statement);

function walk_body(node: any, visitor: any) {
    const body = node.body;
    for (var i = 0, len = body.length; i < len; i++) {
        body[i]._walk(visitor);
    }
}

function clone_block_scope(deep: boolean) {
    var clone = this._clone(deep);
    if (this.block_scope) {
        // TODO this is sometimes undefined during compression.
        // But it should always have a value!
        clone.block_scope = this.block_scope.clone();
    }
    return clone;
}

var AST_Block: any = DEFNODE("Block", "body block_scope", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            walk_body(this, visitor);
        });
    },
    _children_backwards(push: Function) {
        let i = this.body.length;
        while (i--) push(this.body[i]);
    },
    clone: clone_block_scope,
    _size: function () {
        return 2 + list_overhead(this.body);
    }
}, {
    documentation: "A body of statements (usually braced)",
    propdoc: {
        body: "[AST_Statement*] an array of statements",
        block_scope: "[AST_Scope] the block scope"
    },
}, AST_Statement);

var AST_BlockStatement: any = DEFNODE("BlockStatement", null, {}, {
    documentation: "A block statement",
}, AST_Block);

var AST_EmptyStatement: any = DEFNODE("EmptyStatement", null, {}, {
    documentation: "The empty statement (empty block or simply a semicolon)"
}, AST_Statement);

var AST_StatementWithBody: any = DEFNODE("StatementWithBody", "body", {}, {
    documentation: "Base class for all statements that contain one nested body: `For`, `ForIn`, `Do`, `While`, `With`",
    propdoc: {
        body: "[AST_Statement] the body; this should always be present, even if it's an AST_EmptyStatement"
    }
}, AST_Statement);

var AST_LabeledStatement: any = DEFNODE("LabeledStatement", "label", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.label._walk(visitor);
            this.body._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.body);
        push(this.label);
    },
    clone: function(deep: boolean) {
        var node = this._clone(deep);
        if (deep) {
            var label = node.label;
            var def = this.label;
            node.walk(new TreeWalker(function(node: any) {
                if (node instanceof AST_LoopControl
                    && node.label && node.label.thedef === def) {
                    node.label.thedef = label;
                    label.references.push(node);
                }
            }));
        }
        return node;
    }
}, {
    documentation: "Statement with a label",
    propdoc: {
        label: "[AST_Label] a label definition"
    },
}, AST_StatementWithBody);

var AST_IterationStatement: any = DEFNODE("IterationStatement", "block_scope", {
    clone: clone_block_scope
}, {
    documentation: "Internal class.  All loops inherit from it.",
    propdoc: {
        block_scope: "[AST_Scope] the block scope for this iteration statement."
    },
}, AST_StatementWithBody);

var AST_DWLoop: any = DEFNODE("DWLoop", "condition", {}, {
    documentation: "Base class for do/while statements",
    propdoc: {
        condition: "[AST_Node] the loop condition.  Should not be instanceof AST_Statement"
    }
}, AST_IterationStatement);

var AST_Do: any = DEFNODE("Do", null, {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.body._walk(visitor);
            this.condition._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.condition);
        push(this.body);
    }
}, {
    documentation: "A `do` statement",
}, AST_DWLoop);

var AST_While: any = DEFNODE("While", null, {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.condition._walk(visitor);
            this.body._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.body);
        push(this.condition);
    },
}, {
    documentation: "A `while` statement",
}, AST_DWLoop);

var AST_For: any = DEFNODE("For", "init condition step", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            if (this.init) this.init._walk(visitor);
            if (this.condition) this.condition._walk(visitor);
            if (this.step) this.step._walk(visitor);
            this.body._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.body);
        if (this.step) push(this.step);
        if (this.condition) push(this.condition);
        if (this.init) push(this.init);
    },
}, {
    documentation: "A `for` statement",
    propdoc: {
        init: "[AST_Node?] the `for` initialization code, or null if empty",
        condition: "[AST_Node?] the `for` termination clause, or null if empty",
        step: "[AST_Node?] the `for` update clause, or null if empty"
    },
}, AST_IterationStatement);

var AST_ForIn: any = DEFNODE("ForIn", "init object", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.init._walk(visitor);
            this.object._walk(visitor);
            this.body._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.body);
        if (this.object) push(this.object);
        if (this.init) push(this.init);
    },
}, {
    documentation: "A `for ... in` statement",
    propdoc: {
        init: "[AST_Node] the `for/in` initialization code",
        object: "[AST_Node] the object that we're looping through"
    },
}, AST_IterationStatement);

var AST_ForOf: any = DEFNODE("ForOf", "await", {}, {
    documentation: "A `for ... of` statement",
}, AST_ForIn);

var AST_With: any = DEFNODE("With", "expression", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.expression._walk(visitor);
            this.body._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.body);
        push(this.expression);
    },
}, {
    documentation: "A `with` statement",
    propdoc: {
        expression: "[AST_Node] the `with` expression"
    },
}, AST_StatementWithBody);

/* -----[ scope and functions ]----- */

var AST_Scope: any = DEFNODE("Scope", "variables functions uses_with uses_eval parent_scope enclosed cname _var_name_cache", {
    get_defun_scope: function() {
        var self = this;
        while (self.is_block_scope()) {
            self = self.parent_scope;
        }
        return self;
    },
    clone: function(deep: boolean) {
        var node = this._clone(deep);
        if (this.variables) node.variables = new Map(this.variables);
        if (this.functions) node.functions = new Map(this.functions);
        if (this.enclosed) node.enclosed = this.enclosed.slice();
        if (this._block_scope) node._block_scope = this._block_scope;
        return node;
    },
    pinned: function() {
        return this.uses_eval || this.uses_with;
    }
}, {
    documentation: "Base class for all statements introducing a lexical scope",
    propdoc: {
        variables: "[Map/S] a map of name -> SymbolDef for all variables/functions defined in this scope",
        functions: "[Map/S] like `variables`, but only lists function declarations",
        uses_with: "[boolean/S] tells whether this scope uses the `with` statement",
        uses_eval: "[boolean/S] tells whether this scope contains a direct call to the global `eval`",
        parent_scope: "[AST_Scope?/S] link to the parent scope",
        enclosed: "[SymbolDef*/S] a list of all symbol definitions that are accessed from this scope or any subscopes",
        cname: "[integer/S] current index for mangling variables (used internally by the mangler)",
    },
}, AST_Block);

var AST_Toplevel: any = DEFNODE("Toplevel", "globals", {
    wrap_commonjs: function(name: string) {
        var body = this.body;
        var _wrapped_tl = "(function(exports){'$ORIG';})(typeof " + name + "=='undefined'?(" + name + "={}):" + name + ");";
        var wrapped_tl = parse(_wrapped_tl);
        wrapped_tl = wrapped_tl.transform(new TreeTransformer(function(node: any) {
            if (node instanceof AST_Directive && node.value == "$ORIG") {
                return MAP.splice(body);
            }
            return undefined;
        }));
        return wrapped_tl;
    },
    wrap_enclose: function(args_values: string) {
        if (typeof args_values != "string") args_values = "";
        var index = args_values.indexOf(":");
        if (index < 0) index = args_values.length;
        var body = this.body;
        return parse([
            "(function(",
            args_values.slice(0, index),
            '){"$ORIG"})(',
            args_values.slice(index + 1),
            ")"
        ].join("")).transform(new TreeTransformer(function(node: any) {
            if (node instanceof AST_Directive && node.value == "$ORIG") {
                return MAP.splice(body);
            }
            return undefined;
        }));
    },
    _size: function() {
        return list_overhead(this.body);
    }
}, {
    documentation: "The toplevel scope",
    propdoc: {
        globals: "[Map/S] a map of name -> SymbolDef for all undeclared names",
    },
}, AST_Scope);

var AST_Expansion: any = DEFNODE("Expansion", "expression", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.expression.walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.expression);
    },
}, {
    documentation: "An expandible argument, such as ...rest, a splat, such as [1,2,...all], or an expansion in a variable declaration, such as var [first, ...rest] = list",
    propdoc: {
        expression: "[AST_Node] the thing to be expanded"
    },
}, AST_Node);

var AST_Lambda: any = DEFNODE("Lambda", "name argnames uses_arguments is_generator async", {
    args_as_names: function () {
        var out: any[] = [];
        for (var i = 0; i < this.argnames.length; i++) {
            if (this.argnames[i] instanceof AST_Destructuring) {
                out.push(...this.argnames[i].all_symbols());
            } else {
                out.push(this.argnames[i]);
            }
        }
        return out;
    },
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            if (this.name) this.name._walk(visitor);
            var argnames = this.argnames;
            for (var i = 0, len = argnames.length; i < len; i++) {
                argnames[i]._walk(visitor);
            }
            walk_body(this, visitor);
        });
    },
    _children_backwards(push: Function) {
        let i = this.body.length;
        while (i--) push(this.body[i]);

        i = this.argnames.length;
        while (i--) push(this.argnames[i]);

        if (this.name) push(this.name);
    },
}, {
    documentation: "Base class for functions",
    propdoc: {
        name: "[AST_SymbolDeclaration?] the name of this function",
        argnames: "[AST_SymbolFunarg|AST_Destructuring|AST_Expansion|AST_DefaultAssign*] array of function arguments, destructurings, or expanding arguments",
        uses_arguments: "[boolean/S] tells whether this function accesses the arguments array",
        is_generator: "[boolean] is this a generator method",
        async: "[boolean] is this method async",
    },
}, AST_Scope);

var AST_Accessor: any = DEFNODE("Accessor", null, {
    _size: function () {
        return lambda_modifiers(this) + 4 + list_overhead(this.argnames) + list_overhead(this.body);
    }
}, {
    documentation: "A setter/getter function.  The `name` property is always null."
}, AST_Lambda);

var AST_Function: any = DEFNODE("Function", null, {
    _size: function (info) {
        const first: any = !!first_in_statement(info);
        return (first * 2) + lambda_modifiers(this) + 12 + list_overhead(this.argnames) + list_overhead(this.body);
    }
}, {
    documentation: "A function expression"
}, AST_Lambda);

var AST_Arrow: any = DEFNODE("Arrow", null, {
    _size: function (): number {
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
}
}, {
    documentation: "An ES6 Arrow function ((a) => b)"
}, AST_Lambda);

var AST_Defun: any = DEFNODE("Defun", null, {
    _size: function () {
        return lambda_modifiers(this) + 13 + list_overhead(this.argnames) + list_overhead(this.body);
    }
}, {
    documentation: "A function definition"
}, AST_Lambda);

/* -----[ DESTRUCTURING ]----- */
var AST_Destructuring: any = DEFNODE("Destructuring", "names is_array", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.names.forEach(function(name: any) {
                name._walk(visitor);
            });
        });
    },
    _children_backwards(push: Function) {
        let i = this.names.length;
        while (i--) push(this.names[i]);
    },
    all_symbols: function() {
        var out: any[] = [];
        this.walk(new TreeWalker(function (node: any) {
            if (node instanceof AST_Symbol) {
                out.push(node);
            }
        }));
        return out;
    },
    _size: () => 2
}, {
    documentation: "A destructuring of several names. Used in destructuring assignment and with destructuring function argument names",
    propdoc: {
        "names": "[AST_Node*] Array of properties or elements",
        "is_array": "[Boolean] Whether the destructuring represents an object or array"
    },
}, AST_Node);

var AST_PrefixedTemplateString: any = DEFNODE("PrefixedTemplateString", "template_string prefix", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function () {
            this.prefix._walk(visitor);
            this.template_string._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.template_string);
        push(this.prefix);
    },
}, {
    documentation: "A templatestring with a prefix, such as String.raw`foobarbaz`",
    propdoc: {
        template_string: "[AST_TemplateString] The template string",
        prefix: "[AST_SymbolRef|AST_PropAccess] The prefix, which can be a symbol such as `foo` or a dotted expression such as `String.raw`."
    },
}, AST_Node);

var AST_TemplateString: any = DEFNODE("TemplateString", "segments", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function(this: any) {
            this.segments.forEach(function(seg) {
                seg._walk(visitor);
            });
        });
    },
    _children_backwards(push: Function) {
        let i = this.segments.length;
        while (i--) push(this.segments[i]);
    },
    _size: function (): number {
        return 2 + (Math.floor(this.segments.length / 2) * 3);  /* "${}" */
    }
}, {
    documentation: "A template string literal",
    propdoc: {
        segments: "[AST_Node*] One or more segments, starting with AST_TemplateSegment. AST_Node may follow AST_TemplateSegment, but each AST_Node must be followed by AST_TemplateSegment."
    },

}, AST_Node);

var AST_TemplateSegment: any = DEFNODE("TemplateSegment", "value raw", {
    _size: function (): number {
        return this.value.length;
    }
}, {
    documentation: "A segment of a template string literal",
    propdoc: {
        value: "Content of the segment",
        raw: "Raw content of the segment"
    }
}, AST_Node);

/* -----[ JUMPS ]----- */

var AST_Jump: any = DEFNODE("Jump", null, {}, {
    documentation: "Base class for “jumps” (for now that's `return`, `throw`, `break` and `continue`)"
}, AST_Statement);

var AST_Exit: any = DEFNODE("Exit", "value", {
    _walk: function(visitor: any) {
        return visitor._visit(this, this.value && function() {
            this.value._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        if (this.value) push(this.value);
    },
}, {
    documentation: "Base class for “exits” (`return` and `throw`)",
    propdoc: {
        value: "[AST_Node?] the value returned or thrown by this statement; could be null for AST_Return"
    },

}, AST_Jump);

var AST_Return: any = DEFNODE("Return", null, {}, {
    documentation: "A `return` statement"
}, AST_Exit);

var AST_Throw: any = DEFNODE("Throw", null, {}, {
    documentation: "A `throw` statement"
}, AST_Exit);

var AST_LoopControl: any = DEFNODE("LoopControl", "label", {
    _walk: function(visitor: any) {
        return visitor._visit(this, this.label && function() {
            this.label._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        if (this.label) push(this.label);
    },
}, {
    documentation: "Base class for loop control statements (`break` and `continue`)",
    propdoc: {
        label: "[AST_LabelRef?] the label, or null if none",
    },

}, AST_Jump);

var AST_Break: any = DEFNODE("Break", null, {}, {
    documentation: "A `break` statement"
}, AST_LoopControl);

var AST_Continue: any = DEFNODE("Continue", null, {}, {
    documentation: "A `continue` statement"
}, AST_LoopControl);

var AST_Await: any = DEFNODE("Await", "expression", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.expression._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.expression);
    },
}, {
    documentation: "An `await` statement",
    propdoc: {
        expression: "[AST_Node] the mandatory expression being awaited",
    },

}, AST_Node);

var AST_Yield: any = DEFNODE("Yield", "expression is_star", {
    _walk: function(visitor: any) {
        return visitor._visit(this, this.expression && function() {
            this.expression._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        if (this.expression) push(this.expression);
    }
}, {
    documentation: "A `yield` statement",
    propdoc: {
        expression: "[AST_Node?] the value returned or thrown by this statement; could be null (representing undefined) but only when is_star is set to false",
        is_star: "[Boolean] Whether this is a yield or yield* statement"
    },

}, AST_Node);

/* -----[ IF ]----- */

var AST_If: any = DEFNODE("If", "condition alternative", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.condition._walk(visitor);
            this.body._walk(visitor);
            if (this.alternative) this.alternative._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        if (this.alternative) {
            push(this.alternative);
        }
        push(this.body);
        push(this.condition);
    }
}, {
    documentation: "A `if` statement",
    propdoc: {
        condition: "[AST_Node] the `if` condition",
        alternative: "[AST_Statement?] the `else` part, or null if not present"
    },

}, AST_StatementWithBody);

/* -----[ SWITCH ]----- */

var AST_Switch: any = DEFNODE("Switch", "expression", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.expression._walk(visitor);
            walk_body(this, visitor);
        });
    },
    _children_backwards(push: Function) {
        let i = this.body.length;
        while (i--) push(this.body[i]);
        push(this.expression);
    },
    _size: function (): number {
        return 8 + list_overhead(this.body);
    }
}, {
    documentation: "A `switch` statement",
    propdoc: {
        expression: "[AST_Node] the `switch` “discriminant”"
    },

}, AST_Block);

var AST_SwitchBranch: any = DEFNODE("SwitchBranch", null, {}, {
    documentation: "Base class for `switch` branches",
}, AST_Block);

var AST_Default: any = DEFNODE("Default", null, {
    _size: function (): number {
        return 8 + list_overhead(this.body);
    }
}, {
    documentation: "A `default` switch branch",
}, AST_SwitchBranch);

var AST_Case: any = DEFNODE("Case", "expression", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.expression._walk(visitor);
            walk_body(this, visitor);
        });
    },
    _children_backwards(push: Function) {
        let i = this.body.length;
        while (i--) push(this.body[i]);
        push(this.expression);
    },
    _size: function (): number {
        return 5 + list_overhead(this.body);
    }
}, {
    documentation: "A `case` switch branch",
    propdoc: {
        expression: "[AST_Node] the `case` expression"
    },

}, AST_SwitchBranch);

/* -----[ EXCEPTIONS ]----- */

var AST_Try: any = DEFNODE("Try", "bcatch bfinally", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            walk_body(this, visitor);
            if (this.bcatch) this.bcatch._walk(visitor);
            if (this.bfinally) this.bfinally._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        if (this.bfinally) push(this.bfinally);
        if (this.bcatch) push(this.bcatch);
        let i = this.body.length;
        while (i--) push(this.body[i]);
    },
    _size: function (): number {
        return 3 + list_overhead(this.body);
    }
}, {
    documentation: "A `try` statement",
    propdoc: {
        bcatch: "[AST_Catch?] the catch block, or null if not present",
        bfinally: "[AST_Finally?] the finally block, or null if not present"
    },

}, AST_Block);

var AST_Catch: any = DEFNODE("Catch", "argname", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            if (this.argname) this.argname._walk(visitor);
            walk_body(this, visitor);
        });
    },
    _children_backwards(push: Function) {
        let i = this.body.length;
        while (i--) push(this.body[i]);
        if (this.argname) push(this.argname);
    },
    _size: function (): number {
        let size = 7 + list_overhead(this.body);
        if (this.argname) {
            size += 2;
        }
        return size;
    }
}, {
    documentation: "A `catch` node; only makes sense as part of a `try` statement",
    propdoc: {
        argname: "[AST_SymbolCatch|AST_Destructuring|AST_Expansion|AST_DefaultAssign] symbol for the exception"
    },

}, AST_Block);

var AST_Finally: any = DEFNODE("Finally", null, {
    _size: function (): number {
        return 7 + list_overhead(this.body);
    }
}, {
    documentation: "A `finally` node; only makes sense as part of a `try` statement"
}, AST_Block);

/* -----[ VAR/CONST ]----- */

var AST_Definitions: any = DEFNODE("Definitions", "definitions", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            var definitions = this.definitions;
            for (var i = 0, len = definitions.length; i < len; i++) {
                definitions[i]._walk(visitor);
            }
        });
    },
    _children_backwards(push: Function) {
        let i = this.definitions.length;
        while (i--) push(this.definitions[i]);
    },
}, {
    documentation: "Base class for `var` or `const` nodes (variable declarations/initializations)",
    propdoc: {
        definitions: "[AST_VarDef*] array of variable definitions"
    },

}, AST_Statement);

var AST_Var: any = DEFNODE("Var", null, {
    _size: function (): number {
        return def_size(4, this);
    }
}, {
    documentation: "A `var` statement"
}, AST_Definitions);

var AST_Let: any = DEFNODE("Let", null, {
    _size: function (): number {
        return def_size(4, this);
    }
}, {
    documentation: "A `let` statement"
}, AST_Definitions);

var AST_Const: any = DEFNODE("Const", null, {
    _size: function (): number {
        return def_size(6, this);
    }
}, {
    documentation: "A `const` statement"
}, AST_Definitions);

var AST_VarDef: any = DEFNODE("VarDef", "name value", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.name._walk(visitor);
            if (this.value) this.value._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        if (this.value) push(this.value);
        push(this.name);
    },
    _size: function (): number {
        return this.value ? 1 : 0;
    }
}, {
    documentation: "A variable declaration; only appears in a AST_Definitions node",
    propdoc: {
        name: "[AST_Destructuring|AST_SymbolConst|AST_SymbolLet|AST_SymbolVar] name of the variable",
        value: "[AST_Node?] initializer, or null of there's no initializer"
    },

}, AST_Node);

var AST_NameMapping: any = DEFNODE("NameMapping", "foreign_name name", {
    _walk: function (visitor: any) {
        return visitor._visit(this, function() {
            this.foreign_name._walk(visitor);
            this.name._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.name);
        push(this.foreign_name);
    },
    _size: function (): number {
        // foreign name isn't mangled
        return this.name ? 4 : 0;
    }
}, {
    documentation: "The part of the export/import statement that declare names from a module.",
    propdoc: {
        foreign_name: "[AST_SymbolExportForeign|AST_SymbolImportForeign] The name being exported/imported (as specified in the module)",
        name: "[AST_SymbolExport|AST_SymbolImport] The name as it is visible to this module."
    },

}, AST_Node);

var AST_Import: any = DEFNODE("Import", "imported_name imported_names module_name", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function(this: any) {
            if (this.imported_name) {
                this.imported_name._walk(visitor);
            }
            if (this.imported_names) {
                this.imported_names.forEach(function(name_import) {
                    name_import._walk(visitor);
                });
            }
            this.module_name._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.module_name);
        if (this.imported_names) {
            let i = this.imported_names.length;
            while (i--) push(this.imported_names[i]);
        }
        if (this.imported_name) push(this.imported_name);
    },
    _size: function (): number {
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
    }
}, {
    documentation: "An `import` statement",
    propdoc: {
        imported_name: "[AST_SymbolImport] The name of the variable holding the module's default export.",
        imported_names: "[AST_NameMapping*] The names of non-default imported variables",
        module_name: "[AST_String] String literal describing where this module came from",
    },

}, AST_Node);

var AST_Export: any = DEFNODE("Export", "exported_definition exported_value is_default exported_names module_name", {
    _walk: function (visitor: any) {
        return visitor._visit(this, function (this: any) {
            if (this.exported_definition) {
                this.exported_definition._walk(visitor);
            }
            if (this.exported_value) {
                this.exported_value._walk(visitor);
            }
            if (this.exported_names) {
                this.exported_names.forEach(function(name_export) {
                    name_export._walk(visitor);
                });
            }
            if (this.module_name) {
                this.module_name._walk(visitor);
            }
        });
    },
    _children_backwards(push: Function) {
        if (this.module_name) push(this.module_name);
        if (this.exported_names) {
            let i = this.exported_names.length;
            while (i--) push(this.exported_names[i]);
        }
        if (this.exported_value) push(this.exported_value);
        if (this.exported_definition) push(this.exported_definition);
    },
    _size: function (): number {
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
    }
}, {
    documentation: "An `export` statement",
    propdoc: {
        exported_definition: "[AST_Defun|AST_Definitions|AST_DefClass?] An exported definition",
        exported_value: "[AST_Node?] An exported value",
        exported_names: "[AST_NameMapping*?] List of exported names",
        module_name: "[AST_String?] Name of the file to load exports from",
        is_default: "[Boolean] Whether this is the default exported value of this module"
    },

}, AST_Statement);

/* -----[ OTHER ]----- */

var AST_Call: any = DEFNODE("Call", "expression args _annotations", {
    initialize() {
        if (this._annotations == null) this._annotations = 0;
    },
    _walk(visitor: any) {
        return visitor._visit(this, function() {
            var args = this.args;
            for (var i = 0, len = args.length; i < len; i++) {
                args[i]._walk(visitor);
            }
            this.expression._walk(visitor);  // TODO why do we need to crawl this last?
        });
    },
    _children_backwards(push: Function) {
        let i = this.args.length;
        while (i--) push(this.args[i]);
        push(this.expression);
    },
    _size: function (): number {
        return 2 + list_overhead(this.args);
    }
}, {
    documentation: "A function call expression",
    propdoc: {
        expression: "[AST_Node] expression to invoke as function",
        args: "[AST_Node*] array of arguments",
        _annotations: "[number] bitfield containing information about the call"
    },

}, AST_Node);

var AST_New: any = DEFNODE("New", null, {
    _size: function (): number {
        return 6 + list_overhead(this.args);
    }
}, {
    documentation: "An object instantiation.  Derives from a function call since it has exactly the same properties"
}, AST_Call);

var AST_Sequence: any = DEFNODE("Sequence", "expressions", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.expressions.forEach(function(node: any) {
                node._walk(visitor);
            });
        });
    },
    _children_backwards(push: Function) {
        let i = this.expressions.length;
        while (i--) push(this.expressions[i]);
    },
    _size: function (): number {
        return list_overhead(this.expressions);
    }
}, {
    documentation: "A sequence expression (comma-separated expressions)",
    propdoc: {
        expressions: "[AST_Node*] array of expressions (at least two)"
    },

}, AST_Node);

var AST_PropAccess: any = DEFNODE("PropAccess", "expression property", {}, {
    documentation: "Base class for property access expressions, i.e. `a.foo` or `a[\"foo\"]`",
    propdoc: {
        expression: "[AST_Node] the “container” expression",
        property: "[AST_Node|string] the property to access.  For AST_Dot this is always a plain string, while for AST_Sub it's an arbitrary AST_Node"
    }
}, AST_Node);

var AST_Dot: any = DEFNODE("Dot", "quote", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.expression._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.expression);
    },
}, {
    documentation: "A dotted property access expression",
    propdoc: {
        quote: "[string] the original quote character when transformed from AST_Sub",
    },
}, AST_PropAccess);

var AST_Sub: any = DEFNODE("Sub", null, {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.expression._walk(visitor);
            this.property._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.property);
        push(this.expression);
    },
}, {
    documentation: "Index-style property access, i.e. `a[\"foo\"]`",

}, AST_PropAccess);

var AST_Unary: any = DEFNODE("Unary", "operator expression", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.expression._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.expression);
    },
}, {
    documentation: "Base class for unary expressions",
    propdoc: {
        operator: "[string] the operator",
        expression: "[AST_Node] expression that this unary operator applies to"
    },
}, AST_Node);

var AST_UnaryPrefix: any = DEFNODE("UnaryPrefix", null, {}, {
    documentation: "Unary prefix expression, i.e. `typeof i` or `++i`"
}, AST_Unary);

var AST_UnaryPostfix: any = DEFNODE("UnaryPostfix", null, {}, {
    documentation: "Unary postfix expression, i.e. `i++`"
}, AST_Unary);

var AST_Binary: any = DEFNODE("Binary", "operator left right", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.left._walk(visitor);
            this.right._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.right);
        push(this.left);
    },
}, {
    documentation: "Binary expression, i.e. `a + b`",
    propdoc: {
        left: "[AST_Node] left-hand side expression",
        operator: "[string] the operator",
        right: "[AST_Node] right-hand side expression"
    },

}, AST_Node);

var AST_Conditional: any = DEFNODE("Conditional", "condition consequent alternative", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            this.condition._walk(visitor);
            this.consequent._walk(visitor);
            this.alternative._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.alternative);
        push(this.consequent);
        push(this.condition);
    },
}, {
    documentation: "Conditional expression using the ternary operator, i.e. `a ? b : c`",
    propdoc: {
        condition: "[AST_Node]",
        consequent: "[AST_Node]",
        alternative: "[AST_Node]"
    },
}, AST_Node);

var AST_Assign: any = DEFNODE("Assign", null, {}, {
    documentation: "An assignment expression — `a = b + 5`",
}, AST_Binary);

var AST_DefaultAssign: any = DEFNODE("DefaultAssign", null, {}, {
    documentation: "A default assignment expression like in `(a = 3) => a`"
}, AST_Binary);

/* -----[ LITERALS ]----- */

var AST_Array: any = DEFNODE("Array", "elements", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            var elements = this.elements;
            for (var i = 0, len = elements.length; i < len; i++) {
                elements[i]._walk(visitor);
            }
        });
    },
    _children_backwards(push: Function) {
        let i = this.elements.length;
        while (i--) push(this.elements[i]);
    },
    _size: function (): number {
        return 2 + list_overhead(this.elements);
    }
}, {
    documentation: "An array literal",
    propdoc: {
        elements: "[AST_Node*] array of elements"
    },

}, AST_Node);

var AST_Object: any = DEFNODE("Object", "properties", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            var properties = this.properties;
            for (var i = 0, len = properties.length; i < len; i++) {
                properties[i]._walk(visitor);
            }
        });
    },
    _children_backwards(push: Function) {
        let i = this.properties.length;
        while (i--) push(this.properties[i]);
    },
    _size: function (info): number {
        let base = 2;
        if (first_in_statement(info)) {
            base += 2; // parens
        }
        return base + list_overhead(this.properties);
    }
}, {
    documentation: "An object literal",
    propdoc: {
        properties: "[AST_ObjectProperty*] array of properties"
    },
}, AST_Node);

var AST_ObjectProperty: any = DEFNODE("ObjectProperty", "key value", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            if (this.key instanceof AST_Node)
                this.key._walk(visitor);
            this.value._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        push(this.value);
        if (this.key instanceof AST_Node) push(this.key);
    }
}, {
    documentation: "Base class for literal object properties",
    propdoc: {
        key: "[string|AST_Node] property name. For ObjectKeyVal this is a string. For getters, setters and computed property this is an AST_Node.",
        value: "[AST_Node] property value.  For getters and setters this is an AST_Accessor."
    },
}, AST_Node);

var AST_ObjectKeyVal: any = DEFNODE("ObjectKeyVal", "quote", {
    computed_key() {
        return this.key instanceof AST_Node;
    },
    _size: function (): number {
        return key_size(this.key) + 1;
    }
}, {
    documentation: "A key: value object property",
    propdoc: {
        quote: "[string] the original quote character"
    },
}, AST_ObjectProperty);

var AST_ObjectSetter: any = DEFNODE("ObjectSetter", "quote static", {
    computed_key() {
        return !(this.key instanceof AST_SymbolMethod);
    }
}, {
    propdoc: {
        quote: "[string|undefined] the original quote character, if any",
        static: "[boolean] whether this is a static setter (classes only)"
    },
    documentation: "An object setter property",
}, AST_ObjectProperty);

var AST_ObjectGetter: any = DEFNODE("ObjectGetter", "quote static", {
    computed_key() {
        return !(this.key instanceof AST_SymbolMethod);
    }
}, {
    propdoc: {
        quote: "[string|undefined] the original quote character, if any",
        static: "[boolean] whether this is a static getter (classes only)"
    },
    documentation: "An object getter property",
}, AST_ObjectProperty);

var AST_ConciseMethod: any = DEFNODE("ConciseMethod", "quote static is_generator async", {
    computed_key() {
        return !(this.key instanceof AST_SymbolMethod);
    },
    _size: function (): number {
        return static_size(this.static) + key_size(this.key) + lambda_modifiers(this);
    }
}, {
    propdoc: {
        quote: "[string|undefined] the original quote character, if any",
        static: "[boolean] is this method static (classes only)",
        is_generator: "[boolean] is this a generator method",
        async: "[boolean] is this method async",
    },
    documentation: "An ES6 concise method inside an object or class",
}, AST_ObjectProperty);

var AST_Class: any = DEFNODE("Class", "name extends properties", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function(this: any) {
            if (this.name) {
                this.name._walk(visitor);
            }
            if (this.extends) {
                this.extends._walk(visitor);
            }
            this.properties.forEach((prop) => prop._walk(visitor));
        });
    },
    _children_backwards(push: Function) {
        let i = this.properties.length;
        while (i--) push(this.properties[i]);
        if (this.extends) push(this.extends);
        if (this.name) push(this.name);
    },
    _size: function (): number {
        return (
            (this.name ? 8 : 7)
            + (this.extends ? 8 : 0)
        );
    }
}, {
    propdoc: {
        name: "[AST_SymbolClass|AST_SymbolDefClass?] optional class name.",
        extends: "[AST_Node]? optional parent class",
        properties: "[AST_ObjectProperty*] array of properties"
    },
    documentation: "An ES6 class",

}, AST_Scope /* TODO a class might have a scope but it's not a scope */);

var AST_ClassProperty = DEFNODE("ClassProperty", "static quote", {
    _walk: function(visitor: any) {
        return visitor._visit(this, function() {
            if (this.key instanceof AST_Node)
                this.key._walk(visitor);
            if (this.value instanceof AST_Node)
                this.value._walk(visitor);
        });
    },
    _children_backwards(push: Function) {
        if (this.value instanceof AST_Node) push(this.value);
        if (this.key instanceof AST_Node) push(this.key);
    },
    computed_key() {
        return !(this.key instanceof AST_SymbolClassProperty);
    },
    _size: function (): number {
        return (
            static_size(this.static)
            + (typeof this.key === "string" ? this.key.length + 2 : 0)
            + (this.value ? 1 : 0)
        );
    }
}, {
    documentation: "A class property",
    propdoc: {
        static: "[boolean] whether this is a static key",
        quote: "[string] which quote is being used"
    },
}, AST_ObjectProperty);

var AST_DefClass: any = DEFNODE("DefClass", null, {}, {
    documentation: "A class definition",
}, AST_Class);

var AST_ClassExpression: any = DEFNODE("ClassExpression", null, {}, {
    documentation: "A class expression."
}, AST_Class);

let mangle_options = undefined;

var AST_Symbol: any = DEFNODE("Symbol", "scope name thedef", {
    _size: function (): number {
        return !mangle_options || this.definition().unmangleable(mangle_options)
            ? this.name.length
            : 2;
    }
}, {
    propdoc: {
        name: "[string] name of this symbol",
        scope: "[AST_Scope/S] the current scope (not necessarily the definition scope)",
        thedef: "[SymbolDef/S] the definition of this symbol"
    },
    documentation: "Base class for all symbols"
}, AST_Node);

var AST_NewTarget: any = DEFNODE("NewTarget", null, {}, {
    documentation: "A reference to new.target"
}, AST_Node);

var AST_SymbolDeclaration: any = DEFNODE("SymbolDeclaration", "init", {}, {
    documentation: "A declaration symbol (symbol in var/const, function name or argument, symbol in catch)",
}, AST_Symbol);

var AST_SymbolVar: any = DEFNODE("SymbolVar", null, {}, {
    documentation: "Symbol defining a variable",
}, AST_SymbolDeclaration);

var AST_SymbolBlockDeclaration: any = DEFNODE("SymbolBlockDeclaration", null, {}, {
    documentation: "Base class for block-scoped declaration symbols"
}, AST_SymbolDeclaration);

var AST_SymbolConst: any = DEFNODE("SymbolConst", null, {}, {
    documentation: "A constant declaration"
}, AST_SymbolBlockDeclaration);

var AST_SymbolLet: any = DEFNODE("SymbolLet", null, {}, {
    documentation: "A block-scoped `let` declaration"
}, AST_SymbolBlockDeclaration);

var AST_SymbolFunarg: any = DEFNODE("SymbolFunarg", null, {}, {
    documentation: "Symbol naming a function argument",
}, AST_SymbolVar);

var AST_SymbolDefun: any = DEFNODE("SymbolDefun", null, {}, {
    documentation: "Symbol defining a function",
}, AST_SymbolDeclaration);

var AST_SymbolMethod: any = DEFNODE("SymbolMethod", null, {}, {
    documentation: "Symbol in an object defining a method",
}, AST_Symbol);

var AST_SymbolClassProperty = DEFNODE("SymbolClassProperty", null, {
    // TODO take propmangle into account
    _size: function (): number {
        return this.name.length;
    }
}, {
    documentation: "Symbol for a class property",
}, AST_Symbol);

var AST_SymbolLambda: any = DEFNODE("SymbolLambda", null, {}, {
    documentation: "Symbol naming a function expression",
}, AST_SymbolDeclaration);

var AST_SymbolDefClass: any = DEFNODE("SymbolDefClass", null, {}, {
    documentation: "Symbol naming a class's name in a class declaration. Lexically scoped to its containing scope, and accessible within the class."
}, AST_SymbolBlockDeclaration);

var AST_SymbolClass: any = DEFNODE("SymbolClass", null, {}, {
    documentation: "Symbol naming a class's name. Lexically scoped to the class."
}, AST_SymbolDeclaration);

var AST_SymbolCatch: any = DEFNODE("SymbolCatch", null, {}, {
    documentation: "Symbol naming the exception in catch",
}, AST_SymbolBlockDeclaration);

var AST_SymbolImport: any = DEFNODE("SymbolImport", null, {}, {
    documentation: "Symbol referring to an imported name",
}, AST_SymbolBlockDeclaration);

var AST_SymbolImportForeign: any = DEFNODE("SymbolImportForeign", null, {}, {
    documentation: "A symbol imported from a module, but it is defined in the other module, and its real name is irrelevant for this module's purposes",
}, AST_Symbol);

var AST_Label: any = DEFNODE("Label", "references", {
    initialize: function() {
        this.references = [];
        this.thedef = this;
    }
}, {
    documentation: "Symbol naming a label (declaration)",
    propdoc: {
        references: "[AST_LoopControl*] a list of nodes referring to this label"
    },
}, AST_Symbol);

var AST_SymbolRef: any = DEFNODE("SymbolRef", null, {
    _size: function (): number {
        const { name, thedef } = this;

        if (thedef && thedef.global) return name.length;

        if (name === "arguments") return 9;

        return 2;
    }
}, {
    documentation: "Reference to some symbol (not definition/declaration)",
}, AST_Symbol);

var AST_SymbolExport: any = DEFNODE("SymbolExport", null, {}, {
    documentation: "Symbol referring to a name to export",
}, AST_SymbolRef);

var AST_SymbolExportForeign: any = DEFNODE("SymbolExportForeign", null, {}, {
    documentation: "A symbol exported from this module, but it is used in the other module, and its real name is irrelevant for this module's purposes",
}, AST_Symbol);

var AST_LabelRef: any = DEFNODE("LabelRef", null, {}, {
    documentation: "Reference to a label symbol",
}, AST_Symbol);

var AST_This: any = DEFNODE("This", null, {}, {
    documentation: "The `this` symbol",
}, AST_Symbol);

var AST_Super: any = DEFNODE("Super", null, {}, {
    documentation: "The `super` symbol",
}, AST_This);

var AST_Constant: any = DEFNODE("Constant", null, {
    getValue: function() {
        return this.value;
    }
}, {
    documentation: "Base class for all constants",
}, AST_Node);

var AST_String: any = DEFNODE("String", "value quote", {}, {
    documentation: "A string literal",
    propdoc: {
        value: "[string] the contents of this string",
        quote: "[string] the original quote character"
    }
}, AST_Constant);

var AST_Number: any = DEFNODE("Number", "value literal", {}, {
    documentation: "A number literal",
    propdoc: {
        value: "[number] the numeric value",
        literal: "[string] numeric value as string (optional)"
    }
}, AST_Constant);

var AST_BigInt = DEFNODE("BigInt", "value", {}, {
    documentation: "A big int literal",
    propdoc: {
        value: "[string] big int value"
    }
}, AST_Constant);

var AST_RegExp: any = DEFNODE("RegExp", "value", {}, {
    documentation: "A regexp literal",
    propdoc: {
        value: "[RegExp] the actual regexp",
    }
}, AST_Constant);

var AST_Atom: any = DEFNODE("Atom", null, {}, {
    documentation: "Base class for atoms",
}, AST_Constant);

var AST_Null: any = DEFNODE("Null", null, {
    value: null
}, {
    documentation: "The `null` atom",
}, AST_Atom);

var AST_NaN: any = DEFNODE("NaN", null, {
    value: 0/0
}, {
    documentation: "The impossible value",
}, AST_Atom);

var AST_Undefined: any = DEFNODE("Undefined", null, {
    value: (function() {}())
}, {
    documentation: "The `undefined` value",
}, AST_Atom);

var AST_Hole: any = DEFNODE("Hole", null, {
    value: (function() {}())
}, {
    documentation: "A hole in an array",
}, AST_Atom);

var AST_Infinity: any = DEFNODE("Infinity", null, {
    value: 1/0
}, {
    documentation: "The `Infinity` value",
}, AST_Atom);

var AST_Boolean: any = DEFNODE("Boolean", null, {}, {
    documentation: "Base class for booleans",
}, AST_Atom);

var AST_False: any = DEFNODE("False", null, {
    value: false
}, {
    documentation: "The `false` atom",
}, AST_Boolean);

var AST_True: any = DEFNODE("True", null, {
    value: true
}, {
    documentation: "The `true` atom",
}, AST_Boolean);

/* -----[ Walk function ]---- */

/**
 * Walk nodes in depth-first search fashion.
 * Callback can return `walk_abort` symbol to stop iteration.
 * It can also return `true` to stop iteration just for child nodes.
 * Iteration can be stopped and continued by passing the `to_visit` argument,
 * which is given to the callback in the second argument.
 **/
function walk(node: any, cb: Function, to_visit = [node]) {
    const push = to_visit.push.bind(to_visit);
    while (to_visit.length) {
        const node = to_visit.pop();
        const ret = cb(node, to_visit);

        if (ret) {
            if (ret === walk_abort) return true;
            continue;
        }

        node?._children_backwards(push);
    }
    return false;
}

function walk_parent(node: any, cb: Function, initial_stack?: any[]) {
    const to_visit = [node];
    const push = to_visit.push.bind(to_visit);
    const stack = initial_stack ? initial_stack.slice() : [];
    const parent_pop_indices: any[] = [];

    let current: any | undefined;

    const info = {
        parent: (n = 0) => {
            if (n === -1) {
                return current;
            }

            // [ p1 p0 ] [ 1 0 ]
            if (initial_stack && n >= stack.length) {
                n -= stack.length;
                return initial_stack[
                    initial_stack.length - (n + 1)
                ];
            }

            return stack[stack.length - (1 + n)];
        },
    };

    while (to_visit.length) {
        current = to_visit.pop();

        while (
            parent_pop_indices.length &&
            to_visit.length == parent_pop_indices[parent_pop_indices.length - 1]
        ) {
            stack.pop();
            parent_pop_indices.pop();
        }

        const ret = cb(current, info);

        if (ret) {
            if (ret === walk_abort) return true;
            continue;
        }

        const visit_length = to_visit.length;

        current?._children_backwards(push);

        // Push only if we're going to traverse the children
        if (to_visit.length > visit_length) {
            stack.push(current);
            parent_pop_indices.push(visit_length - 1);
        }
    }

    return false;
}

const walk_abort = Symbol("abort walk");

/* -----[ TreeWalker ]----- */

class TreeWalker {
    visit: any
    stack: any[]
    directives: AnyObject
    safe_ids: any;
    in_loop: any;
    loop_ids: Map<any, any> | undefined;
    defs_to_safe_ids: Map<any, any> | undefined;
    constructor(callback?: (node: any, descend: Function) => any) {
        this.visit = callback;
        this.stack = [];
        this.directives = Object.create(null);
    }

    _visit(node: any, descend?: Function) {
        this.push(node);
        var ret = this.visit(node, descend ? function() {
            descend.call(node);
        } : noop);
        if (!ret && descend) {
            descend.call(node);
        }
        this.pop();
        return ret;
    }

    parent(n = 0) {
        return this.stack[this.stack.length - 2 - (n || 0)];
    }

    push(node: any) {
        if (node instanceof AST_Lambda) {
            this.directives = Object.create(this.directives);
        } else if (node instanceof AST_Directive && !this.directives[node.value]) {
            this.directives[node.value] = node;
        } else if (node instanceof AST_Class) {
            this.directives = Object.create(this.directives);
            if (!this.directives["use strict"]) {
                this.directives["use strict"] = node;
            }
        }
        this.stack.push(node);
    }

    pop() {
        var node = this.stack.pop();
        if (node instanceof AST_Lambda || node instanceof AST_Class) {
            this.directives = Object.getPrototypeOf(this.directives);
        }
    }

    self() {
        return this.stack[this.stack.length - 1];
    }

    find_parent(type: any) {
        var stack = this.stack;
        for (var i = stack.length; --i >= 0;) {
            var x = stack[i];
            if (x instanceof type) return x;
        }
    }

    has_directive(type: string): any {
        var dir = this.directives[type];
        if (dir) return dir;
        var node = this.stack[this.stack.length - 1];
        if (node instanceof AST_Scope && node.body) {
            for (var i = 0; i < node.body.length; ++i) {
                var st = node.body[i];
                if (!(st instanceof AST_Directive)) break;
                if (st.value == type) return st;
            }
        }
    }

    loopcontrol_target(node: any): any | undefined {
        var stack = this.stack;
        if (node.label) for (var i = stack.length; --i >= 0;) {
            var x = stack[i];
            if (x instanceof AST_LabeledStatement && x.label.name == node.label.name)
                return x.body as any; // TODO: check this type
        } else for (var i = stack.length; --i >= 0;) {
            var x = stack[i];
            if (x instanceof AST_IterationStatement
                || node instanceof AST_Break && x instanceof AST_Switch)
                return x;
        }
    }
}

// Tree transformer helpers.
class TreeTransformer extends TreeWalker {
    before: any
    after: any
    constructor(before: any, after?: any) {
        super();
        this.before = before;
        this.after = after;
    }
}

const _PURE     = 0b00000001;
const _INLINE   = 0b00000010;
const _NOINLINE = 0b00000100;

export {
    AST_Accessor,
    AST_Array,
    AST_Arrow,
    AST_Assign,
    AST_Atom,
    AST_Await,
    AST_BigInt,
    AST_Binary,
    AST_Block,
    AST_BlockStatement,
    AST_Boolean,
    AST_Break,
    AST_Call,
    AST_Case,
    AST_Catch,
    AST_Class,
    AST_ClassExpression,
    AST_ClassProperty,
    AST_ConciseMethod,
    AST_Conditional,
    AST_Const,
    AST_Constant,
    AST_Continue,
    AST_Debugger,
    AST_Default,
    AST_DefaultAssign,
    AST_DefClass,
    AST_Definitions,
    AST_Defun,
    AST_Destructuring,
    AST_Directive,
    AST_Do,
    AST_Dot,
    AST_DWLoop,
    AST_EmptyStatement,
    AST_Exit,
    AST_Expansion,
    AST_Export,
    AST_False,
    AST_Finally,
    AST_For,
    AST_ForIn,
    AST_ForOf,
    AST_Function,
    AST_Hole,
    AST_If,
    AST_Import,
    AST_Infinity,
    AST_IterationStatement,
    AST_Jump,
    AST_Label,
    AST_LabeledStatement,
    AST_LabelRef,
    AST_Lambda,
    AST_Let,
    AST_LoopControl,
    AST_NameMapping,
    AST_NaN,
    AST_New,
    AST_NewTarget,
    AST_Node,
    AST_Null,
    AST_Number,
    AST_Object,
    AST_ObjectGetter,
    AST_ObjectKeyVal,
    AST_ObjectProperty,
    AST_ObjectSetter,
    AST_PrefixedTemplateString,
    AST_PropAccess,
    AST_RegExp,
    AST_Return,
    AST_Scope,
    AST_Sequence,
    AST_SimpleStatement,
    AST_Statement,
    AST_StatementWithBody,
    AST_String,
    AST_Sub,
    AST_Super,
    AST_Switch,
    AST_SwitchBranch,
    AST_Symbol,
    AST_SymbolBlockDeclaration,
    AST_SymbolCatch,
    AST_SymbolClass,
    AST_SymbolClassProperty,
    AST_SymbolConst,
    AST_SymbolDeclaration,
    AST_SymbolDefClass,
    AST_SymbolDefun,
    AST_SymbolExport,
    AST_SymbolExportForeign,
    AST_SymbolFunarg,
    AST_SymbolImport,
    AST_SymbolImportForeign,
    AST_SymbolLambda,
    AST_SymbolLet,
    AST_SymbolMethod,
    AST_SymbolRef,
    AST_SymbolVar,
    AST_TemplateSegment,
    AST_TemplateString,
    AST_This,
    AST_Throw,
    AST_Token,
    AST_Toplevel,
    AST_True,
    AST_Try,
    AST_Unary,
    AST_UnaryPostfix,
    AST_UnaryPrefix,
    AST_Undefined,
    AST_Var,
    AST_VarDef,
    AST_While,
    AST_With,
    AST_Yield,
    TreeTransformer,
    TreeWalker,
    walk,
    walk_abort,
    walk_body,
    walk_parent,
    _INLINE,
    _NOINLINE,
    _PURE,
};

AST_NewTarget.prototype._size = () => 10;

AST_SymbolImportForeign.prototype._size = function (): number {
    return this.name.length;
};

AST_SymbolExportForeign.prototype._size = function (): number {
    return this.name.length;
};

AST_This.prototype._size = () => 4;

AST_Super.prototype._size = () => 5;

AST_String.prototype._size = function (): number {
    return this.value.length + 2;
};

AST_Number.prototype._size = function (): number {
    const { value } = this;
    if (value === 0) return 1;
    if (value > 0 && Math.floor(value) === value) {
        return Math.floor(Math.log10(value) + 1);
    }
    return value.toString().length;
};

AST_BigInt.prototype._size = function (): number {
    return this.value.length;
};

AST_RegExp.prototype._size = function (): number {
    return this.value.toString().length;
};

AST_Number.prototype._size = function (): number {
    const { value } = this;
    if (value === 0) return 1;
    if (value > 0 && Math.floor(value) === value) {
        return Math.floor(Math.log10(value) + 1);
    }
    return value.toString().length;
};

AST_BigInt.prototype._size = function (): number {
    return this.value.length;
};

AST_RegExp.prototype._size = function (): number {
    return this.value.toString().length;
};

AST_Null.prototype._size = () => 4;

AST_NaN.prototype._size = () => 3;

AST_Undefined.prototype._size = () => 6; // "void 0"

AST_Hole.prototype._size = () => 0;  // comma is taken into account

AST_Infinity.prototype._size = () => 8;

AST_True.prototype._size = () => 4;

AST_False.prototype._size = () => 5;

AST_Await.prototype._size = () => 6;

AST_Yield.prototype._size = () => 6;

AST_EmptyStatement.prototype._size = () => 1;

AST_LabeledStatement.prototype._size = () => 2;  // x:

AST_Do.prototype._size = () => 9;

AST_While.prototype._size = () => 7;

AST_For.prototype._size = () => 8;

AST_ForIn.prototype._size = () => 8;
// AST_ForOf inherits ^

AST_With.prototype._size = () => 6;

AST_Expansion.prototype._size = () => 3;

AST_Return.prototype._size = function () {
    return this.value ? 7 : 6;
};

AST_Throw.prototype._size = () => 6;

AST_Break.prototype._size = function () {
    return this.label ? 6 : 5;
};

AST_Continue.prototype._size = function () {
    return this.label ? 9 : 8;
};

AST_If.prototype._size = () => 4;

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

AST_ObjectGetter.prototype._size = function (): number {
    return 5 + static_size(this.static) + key_size(this.key);
};

AST_ObjectSetter.prototype._size = function (): number {
    return 5 + static_size(this.static) + key_size(this.key);
};

