import AST_Node from './node'
import AST_Symbol from './symbol'
import AST_ObjectProperty from './object-property'
import { to_moz, lift_key, make_node, mkshallow, print_property_name, key_size } from '../utils'
import { is_identifier_string, RESERVED_WORDS } from '../parse'

export default class AST_ObjectKeyVal extends AST_ObjectProperty {
  quote: any
  key: any
  value: any

  _to_mozilla_ast (parent) {
    var key = this.key instanceof AST_Node ? to_moz(this.key) : {
      type: 'Identifier',
      value: this.key
    }
    if (typeof this.key === 'number') {
      key = {
        type: 'Literal',
        value: Number(this.key)
      }
    }
    if (typeof this.key === 'string') {
      key = {
        type: 'Identifier',
        name: this.key
      }
    }
    var kind
    var string_or_num = typeof this.key === 'string' || typeof this.key === 'number'
    var computed = string_or_num ? false : !(this.key?.isAst?.('AST_Symbol')) || this.key?.isAst?.('AST_SymbolRef')
    if (this.isAst('AST_ObjectKeyVal')) {
      kind = 'init'
      computed = !string_or_num
    }
    if (parent?.isAst?.('AST_Class')) {
      return {
        type: 'MethodDefinition',
        computed: computed,
        kind: kind,
        static: (this as any).static,
        key: to_moz(this.key),
        value: to_moz(this.value)
      }
    }
    return {
      type: 'Property',
      computed: computed,
      kind: kind,
      key: key,
      value: to_moz(this.value)
    }
  }

  _optimize = function (self, compressor) {
    lift_key(self, compressor)
    // p:function(){} ---> p(){}
    // p:function*(){} ---> *p(){}
    // p:async function(){} ---> async p(){}
    // p:()=>{} ---> p(){}
    // p:async()=>{} ---> async p(){}
    var unsafe_methods = compressor.option('unsafe_methods')
    if (unsafe_methods &&
          compressor.option('ecma') >= 2015 &&
          (!(unsafe_methods instanceof RegExp) || unsafe_methods.test(self.key + ''))) {
      var key = self.key
      var value = self.value
      var is_arrow_with_block = value?.isAst?.('AST_Arrow') &&
              Array.isArray(value.body) &&
              !value.contains_this()
      if ((is_arrow_with_block || value?.isAst?.('AST_Function')) && !value.name) {
        return make_node('AST_ConciseMethod', self, {
          async: value.async,
          is_generator: value.is_generator,
          key: key instanceof AST_Node ? key : make_node('AST_SymbolMethod', self, {
            name: key
          }),
          value: make_node('AST_Accessor', value, value),
          quote: self.quote
        })
      }
    }
    return self
  }

  computed_key () {
    return this.key instanceof AST_Node
  }

  shallow_cmp = mkshallow({ key: 'eq' })
  _size = function (): number {
    return key_size(this.key) + 1
  }

  _codegen = function (self, output) {
    function get_name (self: any) {
      var def = self.definition()
      return def ? def.mangled_name || def.name : self.name
    }

    var allowShortHand = output.option('shorthand')
    if (allowShortHand &&
            self.value instanceof AST_Symbol &&
            is_identifier_string(self.key, (output.option('ecma') as unknown as number) >= 2015) &&
            get_name(self.value) === self.key &&
            !RESERVED_WORDS.has(self.key)
    ) {
      print_property_name(self.key, self.quote, output)
    } else if (allowShortHand &&
            self.value?.isAst?.('AST_DefaultAssign') &&
            self.value.left instanceof AST_Symbol &&
            is_identifier_string(self.key, (output.option('ecma') as unknown as number) >= 2015) &&
            get_name(self.value.left) === self.key
    ) {
      print_property_name(self.key, self.quote, output)
      output.space()
      output.print('=')
      output.space()
      self.value.right.print(output)
    } else {
      if (!(self.key instanceof AST_Node)) {
        print_property_name(self.key, self.quote, output)
      } else {
        output.with_square(function () {
          self.key.print(output)
        })
      }
      output.colon()
      self.value.print(output)
    }
  }

  static documentation = 'A key: value object property'
  static propdoc = {
    quote: '[string] the original quote character'
  }

  static PROPS = AST_ObjectProperty.PROPS.concat(['quote'])
  constructor (args?) { // eslint-disable-line
    super(args)
    this.quote = args.quote
  }
}
