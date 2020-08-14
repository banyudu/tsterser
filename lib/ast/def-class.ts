import AST_Class from './class'
export default class AST_DefClass extends AST_Class {
  name: any
  extends: any
  properties: any[]

  static documentation = 'A class definition'

  static PROPS = AST_Class.PROPS
  constructor (args?) { // eslint-disable-line
    super(args)
  }
}
