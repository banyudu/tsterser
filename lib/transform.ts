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
    AST_Array,
    AST_Await,
    AST_Binary,
    AST_Block,
    AST_Call,
    AST_Case,
    AST_Catch,
    AST_Class,
    AST_Conditional,
    AST_Definitions,
    AST_Destructuring,
    AST_Do,
    AST_Dot,
    AST_Exit,
    AST_Expansion,
    AST_Export,
    AST_For,
    AST_ForIn,
    AST_If,
    AST_Import,
    AST_LabeledStatement,
    AST_Lambda,
    AST_LoopControl,
    AST_NameMapping,
    AST_Node,
    AST_Number,
    AST_Object,
    AST_ObjectProperty,
    AST_PrefixedTemplateString,
    AST_Sequence,
    AST_SimpleStatement,
    AST_Sub,
    AST_Switch,
    AST_TemplateString,
    AST_Try,
    AST_Unary,
    AST_VarDef,
    AST_While,
    AST_With,
    AST_Yield,
    TreeTransformer,
} from "./ast";
import {
    MAP,
    noop,
} from "./utils/index";
import * as types from "../tools/terser";

function def_transform<T extends typeof types.AST_Node, S=InstanceType<T>>(node: T, descend: (node: S, tw: types.TreeTransformer) => any) {
    node.DEFMETHOD("transform", function(this: types.AST_Node, tw: types.TreeTransformer, in_list: boolean) {
        let transformed: types.AST_Node | undefined = undefined;
        tw.push(this);
        if (tw.before) transformed = tw.before(this, descend, in_list);
        if (transformed === undefined) {
            transformed = this;
            descend(transformed as any, tw);
            if (tw.after) {
                const after_ret = tw.after(transformed, in_list);
                if (after_ret !== undefined) transformed = after_ret;
            }
        }
        tw.pop();
        return transformed;
    });
}

function do_list(list: types.AST_Node[], tw: types.TreeTransformer) {
    return MAP(list, function(node: types.AST_Node) {
        return node.transform(tw, true);
    });
}

def_transform(AST_Node, noop);

def_transform(AST_LabeledStatement, function(self, tw: types.TreeTransformer) {
    self.label = self.label.transform(tw) as types.AST_Label;
    self.body = (self.body as types.AST_Node).transform(tw); // TODO: check type
});

def_transform(AST_SimpleStatement, function(self, tw: types.TreeTransformer) {
    self.body = (self.body as types.AST_Node).transform(tw);
});

def_transform(AST_Block, function(self, tw: types.TreeTransformer) {
    self.body = do_list(self.body, tw);
});

def_transform(AST_Do, function(self, tw: types.TreeTransformer) {
    self.body = (self.body as types.AST_Node).transform(tw);
    self.condition = self.condition.transform(tw);
});

def_transform(AST_While, function(self, tw: types.TreeTransformer) {
    self.condition = self.condition.transform(tw);
    self.body = (self.body as types.AST_Node).transform(tw);
});

def_transform(AST_For, function(self, tw: types.TreeTransformer) {
    if (self.init) self.init = self.init.transform(tw);
    if (self.condition) self.condition = self.condition.transform(tw);
    if (self.step) self.step = self.step.transform(tw);
    self.body = (self.body as types.AST_Node).transform(tw);
});

def_transform(AST_ForIn, function(self, tw: types.TreeTransformer) {
    self.init = self.init?.transform(tw) || null;
    self.object = self.object.transform(tw);
    self.body = (self.body as types.AST_Node).transform(tw);
});

def_transform(AST_With, function(self, tw: types.TreeTransformer) {
    self.expression = self.expression.transform(tw);
    self.body = (self.body as types.AST_Node).transform(tw);
});

def_transform(AST_Exit, function(self, tw: types.TreeTransformer) {
    if (self.value) self.value = self.value.transform(tw);
});

def_transform(AST_LoopControl, function(self, tw: types.TreeTransformer) {
    if (self.label) self.label = self.label.transform(tw) as types.AST_LabelRef;
});

def_transform(AST_If, function(self, tw: types.TreeTransformer) {
    self.condition = self.condition.transform(tw);
    self.body = (self.body as types.AST_Node).transform(tw);
    if (self.alternative) self.alternative = self.alternative.transform(tw);
});

def_transform(AST_Switch, function(self, tw: types.TreeTransformer) {
    self.expression = self.expression.transform(tw);
    self.body = do_list(self.body, tw);
});

def_transform(AST_Case, function(self, tw: types.TreeTransformer) {
    self.expression = self.expression.transform(tw);
    self.body = do_list(self.body, tw);
});

def_transform(AST_Try, function(self, tw: types.TreeTransformer) {
    self.body = do_list(self.body, tw);
    if (self.bcatch) self.bcatch = self.bcatch.transform(tw) as types.AST_Catch;
    if (self.bfinally) self.bfinally = self.bfinally.transform(tw) as types.AST_Finally;
});

def_transform(AST_Catch, function(self, tw: types.TreeTransformer) {
    if (self.argname) self.argname = self.argname.transform(tw);
    self.body = do_list(self.body, tw);
});

def_transform(AST_Definitions, function(self, tw: types.TreeTransformer) {
    self.definitions = do_list(self.definitions, tw);
});

def_transform(AST_VarDef, function(self, tw: types.TreeTransformer) {
    self.name = self.name.transform(tw) as types.AST_Destructuring;
    if (self.value) self.value = self.value.transform(tw);
});

def_transform(AST_Destructuring, function(self, tw: types.TreeTransformer) {
    self.names = do_list(self.names, tw);
});

def_transform(AST_Lambda, function(self, tw: types.TreeTransformer) {
    if (self.name) self.name = self.name.transform(tw) as types.AST_SymbolDeclaration;
    self.argnames = do_list(self.argnames, tw);
    if (self.body instanceof AST_Node) {
        self.body = (self.body as types.AST_Node).transform(tw) as any;
    } else {
        self.body = do_list(self.body, tw);
    }
});

def_transform(AST_Call, function(self, tw: types.TreeTransformer) {
    self.expression = self.expression.transform(tw);
    self.args = do_list(self.args, tw);
});

def_transform(AST_Sequence, function(self, tw: types.TreeTransformer) {
    const result = do_list(self.expressions, tw);
    self.expressions = result.length
        ? result
        : [new AST_Number({ value: 0 })];
});

def_transform(AST_Dot, function(self, tw: types.TreeTransformer) {
    self.expression = self.expression.transform(tw);
});

def_transform(AST_Sub, function(self, tw: types.TreeTransformer) {
    self.expression = self.expression.transform(tw);
    self.property = (self.property as types.AST_Node).transform(tw);
});

def_transform(AST_Yield, function(self, tw: types.TreeTransformer) {
    if (self.expression) self.expression = self.expression.transform(tw);
});

def_transform(AST_Await, function(self, tw: types.TreeTransformer) {
    self.expression = self.expression.transform(tw);
});

def_transform(AST_Unary, function(self, tw: types.TreeTransformer) {
    self.expression = self.expression.transform(tw);
});

def_transform(AST_Binary, function(self, tw: types.TreeTransformer) {
    self.left = self.left.transform(tw);
    self.right = self.right.transform(tw);
});

def_transform(AST_Conditional, function(self, tw: types.TreeTransformer) {
    self.condition = self.condition.transform(tw);
    self.consequent = self.consequent.transform(tw);
    self.alternative = self.alternative.transform(tw);
});

def_transform(AST_Array, function(self, tw: types.TreeTransformer) {
    self.elements = do_list(self.elements, tw);
});

def_transform(AST_Object, function(self, tw: types.TreeTransformer) {
    self.properties = do_list(self.properties, tw);
});

def_transform(AST_ObjectProperty, function(self, tw: types.TreeTransformer) {
    if (self.key instanceof AST_Node) {
        self.key = self.key.transform(tw);
    }
    if (self.value) self.value = self.value.transform(tw);
});

def_transform(AST_Class, function(self, tw: types.TreeTransformer) {
    if (self.name) self.name = self.name.transform(tw) as types.AST_SymbolClass;
    if (self.extends) self.extends = self.extends.transform(tw);
    self.properties = do_list(self.properties, tw);
});

def_transform(AST_Expansion, function(self, tw: types.TreeTransformer) {
    self.expression = self.expression.transform(tw);
});

def_transform(AST_NameMapping, function(self, tw: types.TreeTransformer) {
    self.foreign_name = self.foreign_name.transform(tw) as types.AST_Symbol;
    self.name = self.name.transform(tw) as any;
});

def_transform(AST_Import, function(self, tw: types.TreeTransformer) {
    if (self.imported_name) self.imported_name = self.imported_name.transform(tw) as types.AST_SymbolImport;
    if (self.imported_names) do_list(self.imported_names, tw);
    self.module_name = self.module_name.transform(tw) as types.AST_String;
});

def_transform(AST_Export, function(self, tw: types.TreeTransformer) {
    if (self.exported_definition) self.exported_definition = self.exported_definition.transform(tw) as types.AST_DefClass;
    if (self.exported_value) self.exported_value = self.exported_value.transform(tw);
    if (self.exported_names) do_list(self.exported_names, tw);
    if (self.module_name) self.module_name = self.module_name.transform(tw) as types.AST_String;
});

def_transform(AST_TemplateString, function(self, tw: types.TreeTransformer) {
    self.segments = do_list(self.segments, tw);
});

def_transform(AST_PrefixedTemplateString, function(self, tw: types.TreeTransformer) {
    self.prefix = self.prefix.transform(tw);
    self.template_string = self.template_string.transform(tw) as types.AST_TemplateString;
});

