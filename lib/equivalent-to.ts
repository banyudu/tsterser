const shallow_cmp = (node1, node2) => {
  return (
    node1 === null && node2 === null ||
        node1.TYPE === node2.TYPE && node1.shallow_cmp(node2)
  )
}

export const equivalent_to = (tree1, tree2) => {
  if (!shallow_cmp(tree1, tree2)) return false
  const walk_1_state = [tree1]
  const walk_2_state = [tree2]

  const walk_1_push = walk_1_state.push.bind(walk_1_state)
  const walk_2_push = walk_2_state.push.bind(walk_2_state)

  while (walk_1_state.length && walk_2_state.length) {
    const node_1 = walk_1_state.pop()
    const node_2 = walk_2_state.pop()

    if (!shallow_cmp(node_1, node_2)) return false

    node_1._children_backwards(walk_1_push)
    node_2._children_backwards(walk_2_push)

    if (walk_1_state.length !== walk_2_state.length) {
      // Different number of children
      return false
    }
  }

  return walk_1_state.length == 0 && walk_2_state.length == 0
}
