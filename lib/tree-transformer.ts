import TreeWalker from './tree-walker'
// Tree transformer helpers.
export default class TreeTransformer extends TreeWalker {
  before: Function
  after?: Function
  constructor (before: Function, after?: Function) {
    super()
    this.before = before
    this.after = after
  }
}
