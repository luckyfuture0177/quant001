const CHINESE_ALIASES = {
  '收盘价': 'close',
  '开盘价': 'open',
  '最高价': 'high',
  '最低价': 'low',
  '成交量': 'vol',
  '成交额': 'turnover',
  '振幅': 'amplitude',
  '涨跌幅': 'change_percent',
  '涨跌额': 'change_amount',
  '换手率': 'turnover_rate',
  '买入价': 'buy',
  '卖出价': 'sell',
};

const ALLOWED_OPS = new Set([
  '+', '-', '*', '/', '>', '<', '>=', '<=', '==', '!=',
  'and', 'or', 'not', '&', '|', '(', ')', '**', '//', '%'
]);

function normalizeExpr(expr) {
  let e = expr.replace(/&&/g, ' and ').replace(/\|\|/g, ' or ');
  const sortedAliases = Object.keys(CHINESE_ALIASES).sort((a, b) => b.length - a.length);
  for (const alias of sortedAliases) {
    e = e.split(alias).join(CHINESE_ALIASES[alias]);
  }
  return e;
}

function tokenize(expr) {
  const regex = /[a-zA-Z_]\w*|\d+\.?\d*|[+\-*/<>=!&|()%^~]+|\s+/g;
  const tokens = [];
  let m;
  let lastIndex = 0;
  while ((m = regex.exec(expr)) !== null) {
    if (m.index !== lastIndex) {
      throw new Error(`表达式包含非法字符: '${expr.slice(lastIndex, m.index)}'`);
    }
    lastIndex = regex.lastIndex;
    if (m[0].trim() === '') continue;
    tokens.push(m[0]);
  }
  if (lastIndex !== expr.length) {
    throw new Error(`表达式包含非法字符: '${expr.slice(lastIndex)}'`);
  }
  return tokens;
}

function validateTokens(tokens, allowedNames) {
  for (const tok of tokens) {
    if (ALLOWED_OPS.has(tok)) continue;
    if (/^\d+\.?\d*$/.test(tok)) continue;
    if (/^[a-zA-Z_]\w*$/.test(tok)) {
      if (!allowedNames.has(tok)) {
        throw new Error(`表达式包含未知标识符: '${tok}'。允许的变量: ${[...allowedNames].sort().join(', ')}`);
      }
      continue;
    }
    throw new Error(`表达式包含非法字符/token: '${tok}'`);
  }
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
  }

  peek() { return this.tokens[this.pos]; }
  consume() { return this.tokens[this.pos++]; }
  expect(t) {
    if (this.peek() !== t) throw new Error(`Expected '${t}', got '${this.peek()}'`);
    this.pos++;
  }

  parse() {
    const node = this.parseOr();
    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token after expression: '${this.peek()}'`);
    }
    return node;
  }

  parseOr() {
    let node = this.parseAnd();
    while (this.peek() === 'or') {
      this.consume();
      node = { type: 'binop', op: 'or', left: node, right: this.parseAnd() };
    }
    return node;
  }

  parseAnd() {
    let node = this.parseNot();
    while (this.peek() === 'and') {
      this.consume();
      node = { type: 'binop', op: 'and', left: node, right: this.parseNot() };
    }
    return node;
  }

  parseNot() {
    if (this.peek() === 'not') {
      this.consume();
      return { type: 'unop', op: 'not', operand: this.parseNot() };
    }
    return this.parseComparison();
  }

  parseComparison() {
    let node = this.parseAdditive();
    const comps = ['>', '<', '>=', '<=', '==', '!='];
    while (comps.includes(this.peek())) {
      const op = this.consume();
      node = { type: 'binop', op, left: node, right: this.parseAdditive() };
    }
    return node;
  }

  parseAdditive() {
    let node = this.parseMultiplicative();
    while (this.peek() === '+' || this.peek() === '-') {
      const op = this.consume();
      node = { type: 'binop', op, left: node, right: this.parseMultiplicative() };
    }
    return node;
  }

  parseMultiplicative() {
    let node = this.parsePower();
    while (['*', '/', '//', '%'].includes(this.peek())) {
      const op = this.consume();
      node = { type: 'binop', op, left: node, right: this.parsePower() };
    }
    return node;
  }

  parsePower() {
    let node = this.parseUnary();
    if (this.peek() === '**') {
      this.consume();
      node = { type: 'binop', op: '**', left: node, right: this.parseUnary() };
    }
    return node;
  }

  parseUnary() {
    if (this.peek() === '+' || this.peek() === '-') {
      const op = this.consume();
      return { type: 'unop', op, operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const tok = this.peek();
    if (tok === '(') {
      this.consume();
      const node = this.parseOr();
      this.expect(')');
      return node;
    }
    if (/^\d+\.?\d*$/.test(tok)) {
      this.consume();
      return { type: 'number', value: parseFloat(tok) };
    }
    if (/^[a-zA-Z_]\w*$/.test(tok)) {
      this.consume();
      return { type: 'var', name: tok };
    }
    throw new Error(`Unexpected token: '${tok}'`);
  }
}

function evaluateAST(node, row) {
  switch (node.type) {
    case 'number':
      return node.value;
    case 'var': {
      const v = row[node.name];
      return (v === undefined || Number.isNaN(v)) ? NaN : v;
    }
    case 'unop': {
      const v = evaluateAST(node.operand, row);
      if (Number.isNaN(v)) return NaN;
      switch (node.op) {
        case '+': return +v;
        case '-': return -v;
        case 'not': return !v;
      }
      break;
    }
    case 'binop': {
      const l = evaluateAST(node.left, row);
      const r = evaluateAST(node.right, row);
      if (Number.isNaN(l) || Number.isNaN(r)) return NaN;
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '//': return Math.floor(l / r);
        case '%': return l % r;
        case '**': return Math.pow(l, r);
        case '>': return l > r;
        case '<': return l < r;
        case '>=': return l >= r;
        case '<=': return l <= r;
        case '==': return l === r;
        case '!=': return l !== r;
        case 'and': return l && r;
        case 'or': return l || r;
      }
      break;
    }
  }
  throw new Error(`Unknown node type: ${node.type}`);
}

export class StrategyEvaluator {
  constructor(data) {
    this.data = data;
    this.allowedNames = new Set(data.length > 0 ? Object.keys(data[0]) : []);
  }

  evalExpression(expr) {
    if (!expr || !expr.trim()) {
      return this.data.map(() => false);
    }
    const norm = normalizeExpr(expr);
    const tokens = tokenize(norm);
    validateTokens(tokens, this.allowedNames);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    return this.data.map(row => {
      const v = evaluateAST(ast, row);
      if (Number.isNaN(v)) return false;
      if (typeof v === 'number') return v !== 0;
      return !!v;
    });
  }

  evalExpressionForRow(expr, row) {
    if (!expr || !expr.trim()) {
      return false;
    }
    const norm = normalizeExpr(expr);
    const tokens = tokenize(norm);
    validateTokens(tokens, this.allowedNames);
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const v = evaluateAST(ast, row);
    if (Number.isNaN(v)) return false;
    if (typeof v === 'number') return v !== 0;
    return !!v;
  }
}
