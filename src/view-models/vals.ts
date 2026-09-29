/**
 * The contract between the ops engine and the UI.
 * Derived from the prototype template: every field is a value the ported engine's
 * renderVals() returns and the ported markup reads. Widen a type here only together
 * with the engine change that produces it — see docs/PORTING.md.
 */
import type * as React from 'react';

/** Every field the live flavour editor's form submits (MP-09 c1c), pesos not centavos. */
export interface LiveFlavourFormFields {
  name: string;
  shortName: string;
  description: string;
  imagePath: string;
  allergens: string;
  badge: string;
  kind: 'Permanent' | 'Rotating';
  itemType: 'cookie' | 'set';
  capacityWeight: number;
  sortOrder: number;
  price: number;
  active: boolean;
}

/** Every field the live payment method form submits (MP-09 c2). */
export interface LivePayFormFields {
  label: string;
  accountNumber: string;
  accountName: string;
  qrPath: string;
  active: boolean;
  sortOrder: number;
}

/** The four shop footer texts the owner may set (MP-09 c2). */
export interface LiveShopTexts {
  registrationBadge: string;
  tinLine: string;
  invoiceNote: string;
  allergenNote: string;
}

export interface OpsVals {
  appSub: React.ReactNode;
  /**
   * Set only by OpsRuntime in live mode (not by the ported engine): the frame renders
   * full-screen with no review harness. Undefined everywhere else, so demo is unchanged.
   */
  bareFrame?: boolean;
  /**
   * Set only by OpsRuntime in live mode, owner only: content for the live-only form host
   * that later owner forms plug into (F3, docs/state/protected-exception.md). Shown when
   * `sheet.liveForm` is true. Undefined everywhere else, so demo is unchanged.
   */
  liveForm?: {
    kind: 'flavours';
    online: boolean;
    rows: Array<{
      id: string;
      name: React.ReactNode;
      shortName: React.ReactNode;
      priceText: React.ReactNode;
      published: boolean;
      active: boolean;
      edit: (event?: unknown) => void;
    }>;
    addNew: (event?: unknown) => void;
    publish: (event?: unknown) => void;
    close: (event?: unknown) => void;
    editing:
      | (LiveFlavourFormFields & {
          id: string | null;
          save: (fields: LiveFlavourFormFields) => void;
          cancel: (event?: unknown) => void;
          /** Uploads a photo to the shop-media bucket; resolves to its stored path, or null. */
          upload: (file: File) => Promise<string | null>;
        })
      | null;
  } | null;
  /** Live owner only (MP-09 c2): the payment methods list and editor, on the same form host. */
  livePay?: {
    online: boolean;
    rows: Array<{
      id: string;
      label: string;
      detail: string;
      active: boolean;
      hasQr: boolean;
      edit: (event?: unknown) => void;
    }>;
    addNew: (event?: unknown) => void;
    close: (event?: unknown) => void;
    editing:
      | (LivePayFormFields & {
          id: string | null;
          save: (fields: LivePayFormFields) => void;
          cancel: (event?: unknown) => void;
          upload: (file: File) => Promise<string | null>;
        })
      | null;
  } | null;
  /** Live owner only (MP-09 c2): the shop footer's four texts. */
  liveTexts?: {
    online: boolean;
    texts: LiveShopTexts;
    save: (texts: LiveShopTexts) => void;
    close: (event?: unknown) => void;
  } | null;
  /**
   * Live mode only (MP-09 c2, finding 16): what the shop footer may claim. Every line is the
   * owner's own text; an empty string means the footer prints nothing for it.
   */
  shopFooter?: { badge: string; tin: string; invoice: string; allergens: string };
  /**
   * Live mode only (B2): the customer's checkout, "Find my order" and waiting list. Each is null
   * unless it is on screen, and undefined in demo, so the ported screens are unchanged.
   */
  liveCheckout?: {
    fields: {
      name: string;
      ig: string;
      mobile: string;
      ref: string;
      pickupDate: string;
      pickupTime: string;
      pay: string;
    };
    set: (
      key: 'name' | 'ig' | 'mobile' | 'ref' | 'pickupDate' | 'pickupTime',
      value: string
    ) => void;
    errors: Partial<Record<'name' | 'ig' | 'mobile' | 'date' | 'time' | 'pay' | 'items', string>>;
    dates: Array<{ value: string; label: string }>;
    times: Array<{ value: string; label: string }>;
    rulesState: 'loading' | 'ready' | 'failed';
    /** True while an earlier attempt's outcome is unknown: the fields are frozen. */
    readOnly: boolean;
    sending: boolean;
    banner: { tone: 'error' | 'notice'; text: string; canWaitlist: boolean } | null;
    submit: (event?: unknown) => void;
    changeOrder: (event?: unknown) => void;
    openWaitlist: (event?: unknown) => void;
    holdNote: string;
    placed: {
      orderNo: string;
      statusUrl: string;
      totalText: string;
      copyLink: (event?: unknown) => void;
      seeOrder: (event?: unknown) => void;
      orderAgain: (event?: unknown) => void;
    } | null;
  } | null;
  liveLookup?: {
    state: 'idle' | 'busy' | 'missed' | 'error';
    run: (orderNo: string, mobile: string) => void;
    close: (event?: unknown) => void;
  } | null;
  liveWaitlist?: {
    state: 'idle' | 'sending' | 'done' | 'refused' | 'unknown';
    message: string;
    errors: Partial<Record<'name' | 'ig' | 'mobile' | 'date', string>>;
    min: string;
    max: string;
    join: (fields: { name: string; ig: string; mobile: string; wantedDate: string }) => void;
    close: (event?: unknown) => void;
  } | null;
  /** Live customer pages: opens the waiting list form. */
  openWaitlist?: (event?: unknown) => void;
  askClose: (event?: unknown) => void;
  askReset: (event?: unknown) => void;
  attachReceipt: (event?: unknown) => void;
  backToShop: (event?: unknown) => void;
  bakeAllDone: unknown;
  bakeFlavours: Array<{
    id: string | number;
    label: React.ReactNode;
  }>;
  bakeRejects: React.ReactNode;
  bakeRows: Array<{
    act: (event?: unknown) => void;
    actLabel: React.ReactNode;
    actNum: React.ReactNode;
    actWord: React.ReactNode;
    canMixMore: unknown;
    done: unknown;
    doughText: React.ReactNode;
    hasDough: unknown;
    hasWork: unknown;
    imgStyle: string | number;
    mixAhead: (event?: unknown) => void;
    name: React.ReactNode;
    noDough: unknown;
    openDough: (event?: unknown) => void;
  }>;
  bakeTotals: {
    summary: React.ReactNode;
    toBakeNum: React.ReactNode;
  };
  bakedSheet: {
    committed: React.ReactNode;
    count: React.ReactNode;
    free: React.ReactNode;
    imgStyle: string | number;
    lastBatch: React.ReactNode;
    name: React.ReactNode;
    shortfall: React.ReactNode | null;
    toBake: (event?: unknown) => void;
    toBazaar: (event?: unknown) => void;
    writeOff: (event?: unknown) => void;
  } | null;
  batch: {
    actualNum: React.ReactNode;
    anyShort: unknown;
    confirm: (event?: unknown) => void;
    discard: (event?: unknown) => void;
    doughLine: React.ReactNode;
    doughText: React.ReactNode | null;
    exit: (event?: unknown) => void;
    imgStyle: string | number;
    minus: (event?: unknown) => void;
    name: React.ReactNode;
    note: string | number;
    pid: string | number;
    plus: (event?: unknown) => void;
    rows: Array<{
      amountText: React.ReactNode;
      deltaText: React.ReactNode | null;
      minus: (event?: unknown) => void;
      name: React.ReactNode;
      ok: unknown;
      onHandText: React.ReactNode;
      plus: (event?: unknown) => void;
      short: unknown;
    }>;
    setFlavour: (event?: unknown) => void;
    setNote: (event?: unknown) => void;
    showUsed: unknown;
    step1: unknown;
    step2: unknown;
    target: React.ReactNode;
    targetWord: React.ReactNode;
    toStep1: (event?: unknown) => void;
    toStep2: (event?: unknown) => void;
    toggleUsed: (event?: unknown) => void;
    usedCaret: string | number;
    usedLabel: React.ReactNode;
    varianceOk: unknown;
    varianceText: React.ReactNode;
  } | null;
  boxCount: unknown;
  boxCountText: React.ReactNode;
  boxCta: React.ReactNode;
  boxProgressText: React.ReactNode;
  boxReady: unknown;
  boxTitle: React.ReactNode;
  boxTotalText: React.ReactNode;
  buy: {
    costText: React.ReactNode | null;
    go: (event?: unknown) => void;
    names: React.ReactNode;
    num: React.ReactNode;
    unit: React.ReactNode;
    visible: unknown;
  };
  bzCartCount: React.ReactNode;
  bzCartTotalNum: React.ReactNode;
  bzCloseout: {
    cogs: React.ReactNode;
    expenses: React.ReactNode;
    opening: React.ReactNode;
    profit: React.ReactNode;
    profitOk: unknown;
    remaining: React.ReactNode;
    returned: React.ReactNode;
    revenue: React.ReactNode;
    salesCount: React.ReactNode;
    samples: React.ReactNode;
    sold: React.ReactNode;
  };
  bzDueText: React.ReactNode;
  bzNoEvent: unknown;
  bzReturns: Array<{
    name: React.ReactNode;
    qtyText: React.ReactNode;
  }>;
  bzRevenue: React.ReactNode;
  bzSales: Array<{
    bad: unknown;
    clerk: React.ReactNode | null;
    ok: unknown;
    pay: React.ReactNode;
    refText: React.ReactNode | null;
    retry: (event?: unknown) => void;
    stateText: React.ReactNode;
    summary: React.ReactNode;
    totalText: React.ReactNode;
    void: (event?: unknown) => void;
  }>;
  bzSalesCount: React.ReactNode;
  bzSell: Array<{
    imgStyle: string | number;
    inCart: unknown;
    left: React.ReactNode;
    minus: (event?: unknown) => void;
    name: React.ReactNode;
    priceText: React.ReactNode;
    qtyText: React.ReactNode;
    soldOut: unknown;
    tap: (event?: unknown) => void;
  }>;
  bzStock: Array<{
    availText: React.ReactNode;
    minus: (event?: unknown) => void;
    name: string | number;
    onPrice: (event?: unknown) => void;
    onQty: (event?: unknown) => void;
    plus: (event?: unknown) => void;
    priceValue: string | number;
    qty: string | number;
  }>;
  bzStockEmpty: unknown;
  bzStockTotal: React.ReactNode;
  canPickSupplier: Array<{
    best: unknown;
    name: React.ReactNode;
    pick: (event?: unknown) => void;
    price: React.ReactNode;
    when: React.ReactNode;
  }>;
  cashTenders: Array<{
    go: (event?: unknown) => void;
    label: React.ReactNode;
  }>;
  catOptions: Array<string | number>;
  catRows: Array<{
    name: React.ReactNode;
    rename: (event?: unknown) => void;
    stateText: React.ReactNode;
    toggle: (event?: unknown) => void;
  }>;
  changeText: React.ReactNode | null;
  channels: Array<{
    label: React.ReactNode;
    off: unknown;
    on: unknown;
    toggle: (event?: unknown) => void;
  }>;
  clearFlow: (event?: unknown) => void;
  clearInvQ: (event?: unknown) => void;
  clearNotifs: (event?: unknown) => void;
  clearOrderQ: (event?: unknown) => void;
  clearSupQ: (event?: unknown) => void;
  clerkName: React.ReactNode;
  closeDropConfirm: (event?: unknown) => void;
  closeDropRollover: (event?: unknown) => void;
  closeEvent: (event?: unknown) => void;
  closeQuick: (event?: unknown) => void;
  closeSheet: (event?: unknown) => void;
  cols2: string | number;
  cols3: string | number;
  cols4: string | number;
  confirmNoShow: (event?: unknown) => void;
  confirmReset: (event?: unknown) => void;
  contactSupport: (event?: unknown) => void;
  cust: {
    allergenNote: React.ReactNode;
    amount: string | number;
    amountHint: React.ReactNode | null;
    countText: React.ReactNode;
    email: string | number;
    errAmount: React.ReactNode | null;
    errEmail: React.ReactNode | null;
    errMobile: React.ReactNode | null;
    errName: React.ReactNode | null;
    errPay: React.ReactNode | null;
    errProof: React.ReactNode | null;
    errRef: React.ReactNode | null;
    errWindow: React.ReactNode | null;
    heroBody: React.ReactNode;
    heroTitle: React.ReactNode;
    ig: string | number;
    invoiceLine: React.ReactNode | null;
    lines: Array<{
      imgStyle: string | number;
      line: React.ReactNode;
      name: React.ReactNode;
      qty: React.ReactNode;
    }>;
    methods: Array<{
      holder: React.ReactNode;
      label: React.ReactNode;
      num: React.ReactNode;
      on: unknown;
      pick: (event?: unknown) => void;
    }>;
    mobile: string | number;
    name: string | number;
    noQr: unknown;
    orderNo: React.ReactNode;
    pickupCode: React.ReactNode;
    priceNote: React.ReactNode;
    proofDone: unknown;
    proofNone: unknown;
    proofUploading: unknown;
    qr: string | number | null;
    qrNote: React.ReactNode;
    qrTitle: React.ReactNode;
    ref: string | number;
    refHint: React.ReactNode | null;
    removeProof: (event?: unknown) => void;
    reorder: (event?: unknown) => void;
    restart: (event?: unknown) => void;
    setAmount: (event?: unknown) => void;
    setEmail: (event?: unknown) => void;
    setIg: (event?: unknown) => void;
    setMobile: (event?: unknown) => void;
    setName: (event?: unknown) => void;
    setRef: (event?: unknown) => void;
    showCode: unknown;
    showRetry: unknown;
    submit: (event?: unknown) => void;
    timeline: Array<{
      done: unknown;
      now: unknown;
      sub: React.ReactNode;
      todo: unknown;
      what: React.ReactNode;
    }>;
    totalText: React.ReactNode;
    upload: (event?: unknown) => void;
    windowText: React.ReactNode;
    windows: Array<{
      label: React.ReactNode;
      left: React.ReactNode;
      on: unknown;
      pick: (event?: unknown) => void;
      time: React.ReactNode;
    }>;
  };
  custToCheckout: (event?: unknown) => void;
  customers: Array<{
    count: React.ReactNode;
    name: React.ReactNode;
  }>;
  denied: unknown;
  deniedHome: (event?: unknown) => void;
  deniedText: React.ReactNode;
  deniedTitle: React.ReactNode;
  devices: Array<{
    active: unknown;
    go: (event?: unknown) => void;
    label: React.ReactNode;
  }>;
  digitalTotals: Array<{
    pay: React.ReactNode;
    totalText: React.ReactNode;
  }>;
  discountOptions: Array<{
    go: (event?: unknown) => void;
    label: React.ReactNode;
    on: unknown;
  }>;
  dockNav: Array<{
    active: unknown;
    badge: React.ReactNode | null;
    go: (event?: unknown) => void;
    icon: string;
    label: string | number;
  }>;
  dockPillStyle: string | number;
  doughSheet: {
    aged: unknown;
    discard: (event?: unknown) => void;
    keep: (event?: unknown) => void;
    name: React.ReactNode;
    qty: React.ReactNode;
    stored: React.ReactNode;
  } | null;
  drawerCashText: React.ReactNode;
  drawerCounted: string | number;
  drawerDiffText: React.ReactNode | null;
  drawerExpectedText: React.ReactNode;
  drawerFloatText: React.ReactNode;
  drill: {
    empty: unknown;
    hasRows: unknown;
    rows: Array<{
      amountText: React.ReactNode;
      what: React.ReactNode;
      when: React.ReactNode;
    }>;
    sub: React.ReactNode;
    totalText: React.ReactNode;
  } | null;
  drop: {
    barConfirmed: string | number;
    barPending: string | number;
    capNum: React.ReactNode;
    capText: React.ReactNode;
    closed: unknown;
    closes: React.ReactNode;
    confirmedNum: React.ReactNode;
    go: (event?: unknown) => void;
    leftText: React.ReactNode;
    no: React.ReactNode;
    open: unknown;
    pendingText: React.ReactNode;
  };
  drop2: {
    capBar: string | number;
    capDown: (event?: unknown) => void;
    capInput: string | number;
    capNum: React.ReactNode;
    capUp: (event?: unknown) => void;
    capValue: React.ReactNode;
    closeEarly: (event?: unknown) => void;
    closed: unknown;
    extended: unknown;
    no: React.ReactNode;
    preview: (event?: unknown) => void;
    reopen: (event?: unknown) => void;
    scheduleLine: React.ReactNode;
    setCap: (event?: unknown) => void;
    stateText: React.ReactNode;
  };
  dropBannerBg: string | number;
  dropBannerBr: string | number;
  dropBannerFg: string | number;
  dropBannerSub: React.ReactNode;
  dropBannerTitle: React.ReactNode;
  dropNoText: React.ReactNode;
  dropProducts: Array<{
    imgStyle: string | number;
    name: React.ReactNode;
    priceText: React.ReactNode;
    soldLabel: React.ReactNode;
    soldOut: unknown;
    toggleSold: (event?: unknown) => void;
  }>;
  dropStateOptions: Array<{
    go: (event?: unknown) => void;
    label: React.ReactNode;
    on: unknown;
    what: React.ReactNode;
  }>;
  dropStates: Array<{
    go: (event?: unknown) => void;
    label: React.ReactNode;
    on: unknown;
  }>;
  event: {
    date: React.ReactNode;
    name: React.ReactNode;
    reset: (event?: unknown) => void;
    stage1: unknown;
    stage2: unknown;
    stage3: unknown;
  } | null;
  eventExpenses: Array<{
    amountText: React.ReactNode;
    cat: React.ReactNode;
    label: React.ReactNode;
  }>;
  events: Array<{
    date: React.ReactNode;
    go: (event?: unknown) => void;
    name: React.ReactNode;
    place: React.ReactNode;
  }>;
  expenseItems: Array<{
    id: string | number;
    label: React.ReactNode;
  }>;
  exportNow: (event?: unknown) => void;
  flavourTally: Array<{
    imgStyle: string | number;
    name: React.ReactNode;
    qtyText: React.ReactNode;
  }> | null;
  flavourTallyTotal: React.ReactNode;
  flow: {
    away: unknown;
    awayLabel: React.ReactNode;
    goToStep: (event?: unknown) => void;
    next: React.ReactNode;
    progress: React.ReactNode;
    tag: React.ReactNode;
    title: React.ReactNode;
  } | null;
  flowChips: Array<{
    active: unknown;
    go: (event?: unknown) => void;
    label: React.ReactNode;
  }>;
  frameOuterStyle: string | number;
  frameStyle: string | number;
  goBack: (event?: unknown) => void;
  goBackOwner: (event?: unknown) => void;
  goHealth: (event?: unknown) => void;
  goPnl: (event?: unknown) => void;
  goodCount: React.ReactNode;
  greetSub: React.ReactNode;
  greeting: React.ReactNode;
  groceryAllDone: unknown;
  groceryCountText: React.ReactNode;
  groceryLeftText: React.ReactNode;
  groceryOverBudget: unknown;
  groceryRows: Array<{
    actionLabel: React.ReactNode;
    bought: unknown;
    buyText: React.ReactNode;
    cells: Array<{
      label: React.ReactNode;
      plain: unknown;
      red: unknown;
      value: React.ReactNode;
    }>;
    costText: React.ReactNode;
    name: React.ReactNode;
    partText: React.ReactNode;
    partial: unknown;
    reason: React.ReactNode;
    receive: (event?: unknown) => void;
    received: unknown;
    sub: React.ReactNode;
    subbed: unknown;
    supplier: React.ReactNode;
    supplierSheet: (event?: unknown) => void;
    why: (event?: unknown) => void;
  }>;
  groceryShortCount: unknown;
  groceryTotalNum: React.ReactNode;
  groceryUnderBudget: unknown;
  hasAlerts: unknown;
  hasInvQ: unknown;
  hasOrderQ: unknown;
  hasQueueArchive: unknown;
  hasRecords: unknown;
  hasRejects: unknown;
  hasResume: unknown;
  hasSupQ: unknown;
  healthOk: unknown;
  healthRows: Array<{
    bad: unknown;
    good: unknown;
    hint: React.ReactNode;
    label: React.ReactNode;
    retry: unknown;
    value: React.ReactNode;
  }>;
  healthSub: React.ReactNode;
  healthTitle: React.ReactNode;
  helperBazaarNote: unknown;
  helperCookies: Array<{
    imgStyle: string | number;
    name: React.ReactNode;
    qty: React.ReactNode;
  }>;
  helperStock: Array<{
    low: unknown;
    name: React.ReactNode;
    qtyText: React.ReactNode;
  }>;
  helperView: unknown;
  heroImg: {
    style: string | number;
  };
  heroShow: unknown;
  homeCols: string | number;
  ic: {
    alert: string;
    back: string;
    bazaar: string;
    bell: string;
    camera: string;
    check: string;
    clock: string;
    close: string;
    doc: string;
    down: string;
    export: string;
    grocery: string;
    info: string;
    inventory: string;
    minus: string;
    play: string;
    plus: string;
    right: string;
    search: string;
    sync: string;
  };
  invCountLabel: React.ReactNode;
  invEditable: unknown;
  invEmpty: unknown;
  invEmptyText: React.ReactNode;
  invLowCount: React.ReactNode | null;
  invMeta: {
    counted: React.ReactNode;
    level: React.ReactNode;
    supplier: React.ReactNode;
    system: React.ReactNode;
  } | null;
  invPickList: Array<{
    id: string | number;
    label: React.ReactNode;
  }>;
  invQ: string | number;
  invRows: Array<{
    expiring: unknown;
    go: (event?: unknown) => void;
    low: unknown;
    name: React.ReactNode;
    qtyText: React.ReactNode;
    sub: React.ReactNode;
    useBy: React.ReactNode;
    warn: unknown;
  }>;
  invSubtract: (event?: unknown) => void;
  invTabPill: string | number;
  invTabs: Array<{
    go: (event?: unknown) => void;
    label: React.ReactNode;
  }> | null;
  launcher: Array<{
    items: Array<{
      go: (event?: unknown) => void;
      icon: string;
      label: React.ReactNode;
      sub: React.ReactNode | null;
    }>;
    title: React.ReactNode;
  }>;
  lookupMissed: unknown;
  lookupQ: string | number;
  lowStock: {
    detail: React.ReactNode;
    go: (event?: unknown) => void;
    num: React.ReactNode;
  };
  mix: {
    ballsText: React.ReactNode;
    confirm: (event?: unknown) => void;
    fullBalls: React.ReactNode;
    gramText: React.ReactNode;
    halfBalls: React.ReactNode;
    isFull: unknown;
    isHalf: unknown;
    pickFull: (event?: unknown) => void;
    pickHalf: (event?: unknown) => void;
    pid: string | number;
    rows: Array<{
      amountText: React.ReactNode | null;
      name: React.ReactNode;
      onHandText: React.ReactNode;
      short: unknown;
    }>;
    setFlavour: (event?: unknown) => void;
  } | null;
  money: {
    expenseText: React.ReactNode;
    profitNum: React.ReactNode;
    revenueText: React.ReactNode;
  };
  notifAny: unknown;
  notifDismissed: unknown;
  notifDismissedText: React.ReactNode;
  notifEmpty: unknown;
  notifications: Array<{
    bg: string | number;
    br: string | number;
    dismiss: (event?: unknown) => void;
    fg: string;
    go: (event?: unknown) => void;
    icon: string;
    label: React.ReactNode;
    sub: React.ReactNode;
    urgency: React.ReactNode;
  }>;
  od: {
    askClearer: (event?: unknown) => void;
    askRefund: (event?: unknown) => void;
    askSwap: (event?: unknown) => void;
    balanceText: React.ReactNode;
    bg: string | number;
    br: string | number;
    canCollect: unknown;
    canPack: unknown;
    canRefund: unknown;
    clearContact: (event?: unknown) => void;
    collect: (event?: unknown) => void;
    confirm: (event?: unknown) => void;
    contactBits: Array<{
      text: React.ReactNode;
    }>;
    contactText: React.ReactNode;
    copyLink: (event?: unknown) => void;
    dup: {
      go: (event?: unknown) => void;
      id: React.ReactNode;
      name: React.ReactNode;
    } | null;
    fg: string;
    go: (event?: unknown) => void;
    hasBalance: unknown;
    hasInvoice: unknown;
    hasSwaps: unknown;
    id: React.ReactNode;
    invoice: React.ReactNode;
    isCancelled: unknown;
    label: React.ReactNode;
    lines: Array<{
      flag: (event?: unknown) => void;
      flagLabel: React.ReactNode;
      imgStyle: string | number;
      inStock: unknown;
      line: React.ReactNode;
      name: React.ReactNode;
      out: unknown;
      price: React.ReactNode;
      qty: React.ReactNode;
      swap: (event?: unknown) => void;
    }>;
    link: React.ReactNode;
    linkSent: React.ReactNode;
    metaBits: Array<{
      text: React.ReactNode;
    }>;
    mismatch: unknown;
    name: React.ReactNode;
    needsContact: unknown;
    needsReview: unknown;
    noShow: (event?: unknown) => void;
    openProof: (event?: unknown) => void;
    pack: (event?: unknown) => void;
    packHint: React.ReactNode;
    paidOk: unknown;
    paidText: React.ReactNode;
    pay: React.ReactNode;
    pickup: React.ReactNode;
    placed: React.ReactNode;
    ref: React.ReactNode;
    refBad: React.ReactNode | null;
    reject: (event?: unknown) => void;
    reopen: (event?: unknown) => void;
    settleBalance: (event?: unknown) => void;
    swaps: Array<{
      text: React.ReactNode;
    }>;
    timeline: Array<{
      done: unknown;
      now: unknown;
      todo: unknown;
      what: React.ReactNode;
      when: React.ReactNode;
    }>;
    totalText: React.ReactNode;
    warn: React.ReactNode | null;
    wasRefunded: unknown;
    wasRejected: unknown;
  } | null;
  offTilt: (event?: unknown) => void;
  offline: unknown;
  onTilt: (event?: unknown) => void;
  online: unknown;
  onlineLabel: React.ReactNode;
  openAddInv: (event?: unknown) => void;
  openCategories: (event?: unknown) => void;
  openEventExpense: (event?: unknown) => void;
  openExpense: (event?: unknown) => void;
  openLookup: (event?: unknown) => void;
  openNotifications: (event?: unknown) => void;
  openPay: (event?: unknown) => void;
  openQuick: (event?: unknown) => void;
  openSelling: (event?: unknown) => void;
  openSpoil: (event?: unknown) => void;
  orderEmpty: unknown;
  orderFilters: Array<{
    active: unknown;
    go: (event?: unknown) => void;
    label: React.ReactNode;
    n: React.ReactNode;
  }>;
  orderList: Array<{
    act: (event?: unknown) => void;
    action: React.ReactNode | null;
    bg: string | number;
    br: string | number;
    count: React.ReactNode;
    fg: string;
    id: React.ReactNode;
    label: React.ReactNode;
    name: React.ReactNode;
    pickup: React.ReactNode;
    select: (event?: unknown) => void;
    selected: unknown;
    summary: React.ReactNode;
    totalText: React.ReactNode;
    warn: React.ReactNode | null;
  }>;
  orderQ: string | number;
  overageConfirm: (event?: unknown) => void;
  overageText: React.ReactNode;
  ownerView: unknown;
  pageMax: string | number;
  pagePad: string | number;
  pageSub: React.ReactNode | null;
  pageTitle: React.ReactNode;
  pastDrops: Array<{
    detail: React.ReactNode;
    label: React.ReactNode;
    when: React.ReactNode;
  }>;
  payChannels: Array<{
    holder: React.ReactNode;
    label: React.ReactNode;
    num: React.ReactNode;
  }>;
  payMethods: Array<{
    blocked: unknown;
    go: (event?: unknown) => void;
    label: React.ReactNode;
    style: string | number;
  }>;
  phoneWidths: Array<{
    active: unknown;
    go: (event?: unknown) => void;
    label: React.ReactNode;
  }>;
  pickInvItem: (event?: unknown) => void;
  pickRecvItem: (event?: unknown) => void;
  pickedItems: Array<{
    imgStyle: string | number;
    name: string | number;
    qty: React.ReactNode;
    remove: (event?: unknown) => void;
  }>;
  pl: {
    bazaar: React.ReactNode;
    drawText: React.ReactNode;
    drops: React.ReactNode;
    expenseText: React.ReactNode;
    hasDraw: unknown;
    hasMargins: unknown;
    hasRefunds: unknown;
    marginRows: Array<{
      barStyle: string | number;
      eachText: React.ReactNode;
      madeText: React.ReactNode;
      name: React.ReactNode;
      pctText: React.ReactNode;
      soldText: React.ReactNode;
    }>;
    marginText: React.ReactNode;
    note: React.ReactNode;
    openDraw: (event?: unknown) => void;
    profitNum: React.ReactNode;
    refundedText: React.ReactNode;
    revenueText: React.ReactNode;
    taxPctText: React.ReactNode;
    taxText: React.ReactNode;
  };
  plCols: string | number;
  plExpenseDrill: (event?: unknown) => void;
  plRevenueDrill: (event?: unknown) => void;
  plRows: Array<{
    amountText: React.ReactNode;
    barStyle: string | number;
    cat: React.ReactNode;
    go: (event?: unknown) => void;
    n: React.ReactNode;
  }>;
  plTrend: Array<{
    amount: React.ReactNode;
    label: React.ReactNode;
    now: unknown;
    past: unknown;
    v: string | number;
  }>;
  prep: {
    detail: React.ReactNode;
    go: (event?: unknown) => void;
    n: unknown;
    num: React.ReactNode;
    thumbs: Array<{
      n: React.ReactNode;
      style: string | number;
    }>;
    unit: React.ReactNode;
  };
  priceModePreview: {
    items: React.ReactNode;
    total: React.ReactNode;
  };
  priceModes: Array<{
    label: React.ReactNode;
    on: unknown;
    pick: (event?: unknown) => void;
  }>;
  priceNote: React.ReactNode;
  productRows: Array<{
    costText: React.ReactNode;
    desc: React.ReactNode;
    edit: (event?: unknown) => void;
    formBtnStyle: string | number;
    formIcon: string;
    formLabel: string;
    goRecipe: (event?: unknown) => void;
    imgStyle: string | number;
    name: React.ReactNode;
    offForm: unknown;
    priceText: React.ReactNode;
    rotating: unknown;
    soldOut: unknown;
    tag: React.ReactNode | null;
    toggleOnForm: (event?: unknown) => void;
  }>;
  publishPriceMode: (event?: unknown) => void;
  queueArchive: Array<{
    id: React.ReactNode;
    name: React.ReactNode;
    restore: (event?: unknown) => void;
    when: React.ReactNode;
  }>;
  queueEmpty: unknown;
  queueRows: Array<{
    accept: (event?: unknown) => void;
    countText: React.ReactNode;
    name: React.ReactNode;
    note: React.ReactNode | null;
    orderLine: React.ReactNode;
    raw: React.ReactNode;
    ref: string | number;
    reject: (event?: unknown) => void;
    setRef: (event?: unknown) => void;
    unclear: unknown;
  }>;
  quickActions: Array<{
    go: (event?: unknown) => void;
    icon: string;
    label: React.ReactNode;
    sub: React.ReactNode;
    suggested: unknown;
  }>;
  quickOpen: unknown;
  railNav: Array<{
    badge: React.ReactNode | null;
    go: (event?: unknown) => void;
    icon: string;
    label: React.ReactNode;
  }>;
  railPillStyle: string | number;
  railW: string | number;
  recAllDone: unknown;
  recClear: (event?: unknown) => void;
  recLeftText: React.ReactNode;
  recMethods: Array<{
    done: unknown;
    leftText: React.ReactNode | null;
    n: React.ReactNode;
    pay: React.ReactNode;
    totalText: React.ReactNode;
  }>;
  recRows: Array<{
    amountText: React.ReactNode;
    flagText: React.ReactNode;
    flagged: unknown;
    id: React.ReactNode;
    name: React.ReactNode;
    open: (event?: unknown) => void;
    pay: React.ReactNode;
    pending: unknown;
    ref: string | number;
    ticked: unknown;
    toggle: (event?: unknown) => void;
  }>;
  recTickAll: (event?: unknown) => void;
  recTotalText: React.ReactNode;
  receiptDone: unknown;
  receiptNone: unknown;
  receiptUploading: unknown;
  recipe: {
    addRow: (event?: unknown) => void;
    costText: React.ReactNode;
    currentBatches: React.ReactNode;
    dirty: unknown;
    hasHistory: unknown;
    history: Array<{
      batches: React.ReactNode;
      detail: React.ReactNode;
      label: React.ReactNode;
    }>;
    imgStyle: string | number;
    name: React.ReactNode;
    rows: Array<{
      name: string | number;
      qty: string | number;
      remove: (event?: unknown) => void;
      setName: (event?: unknown) => void;
      setQty: (event?: unknown) => void;
      setUnit: (event?: unknown) => void;
      unit: string | number;
      warn: React.ReactNode | null;
    }>;
    save: (event?: unknown) => void;
    units: Array<string | number>;
    version: React.ReactNode;
    yieldDown: (event?: unknown) => void;
    yieldNum: React.ReactNode;
    yieldText: React.ReactNode;
    yieldUp: (event?: unknown) => void;
  };
  recipeTabs: Array<{
    active: unknown;
    dirty: unknown;
    go: (event?: unknown) => void;
    label: React.ReactNode;
  }>;
  recordFreebie: (event?: unknown) => void;
  recordGroups: Array<{
    countText: React.ReactNode;
    rows: Array<{
      value: React.ReactNode;
      what: React.ReactNode;
      when: React.ReactNode;
    }>;
    title: React.ReactNode;
  }>;
  recvItem: {
    alreadyText: React.ReactNode | null;
    cost: string | number;
    name: string | number;
    offListText: React.ReactNode | null;
    planned: string | number;
    plannedLine: React.ReactNode | null;
    unit: React.ReactNode;
  };
  recvPickList: Array<{
    id: string | number;
    label: React.ReactNode;
  }>;
  rejectsMinus: (event?: unknown) => void;
  rejectsPlus: (event?: unknown) => void;
  removeInvItem: (event?: unknown) => void;
  reopenEvent: (event?: unknown) => void;
  restoreNotifs: (event?: unknown) => void;
  resume: Array<{
    cta: React.ReactNode;
    detail: React.ReactNode;
    go: (event?: unknown) => void;
    icon: string;
    label: React.ReactNode;
  }>;
  retentionOptions: Array<{
    label: React.ReactNode;
    on: unknown;
    pick: (event?: unknown) => void;
  }>;
  retryBackup: (event?: unknown) => void;
  reviewCountText: React.ReactNode;
  reviewDetail: React.ReactNode;
  reviewHasWork: unknown;
  roleInitial: React.ReactNode;
  roleWho: React.ReactNode;
  roles: Array<{
    active: unknown;
    go: (event?: unknown) => void;
    label: React.ReactNode;
  }>;
  rules: Array<{
    down: (event?: unknown) => void;
    label: React.ReactNode;
    note: React.ReactNode;
    set: (event?: unknown) => void;
    up: (event?: unknown) => void;
    value: string | number;
    valueText: React.ReactNode;
  }>;
  runLookup: (event?: unknown) => void;
  runUndo: (event?: unknown) => void;
  saleRef: string | number;
  salesLog: {
    countNum: React.ReactNode;
    empty: unknown;
    rows: Array<{
      amount: React.ReactNode;
      what: React.ReactNode;
      when: React.ReactNode;
    }>;
    unit: React.ReactNode;
  };
  saveAddInv: (event?: unknown) => void;
  saveCategory: (event?: unknown) => void;
  saveDraw: (event?: unknown) => void;
  saveEvExp: (event?: unknown) => void;
  saveExpense: (event?: unknown) => void;
  saveInvDelta: (event?: unknown) => void;
  saveInvEdit: (event?: unknown) => void;
  savePrice: (event?: unknown) => void;
  saveReceive: (event?: unknown) => void;
  saveRefund: (event?: unknown) => void;
  saveSpoil: (event?: unknown) => void;
  savedText: React.ReactNode;
  schedHours: Array<{
    down: (event?: unknown) => void;
    label: React.ReactNode;
    up: (event?: unknown) => void;
    valueText: React.ReactNode;
  }>;
  schedRows: Array<{
    label: React.ReactNode;
    next: (event?: unknown) => void;
    prev: (event?: unknown) => void;
    value: React.ReactNode;
  }>;
  screenAnim: string | number;
  screens: {
    bake: unknown;
    batch: unknown;
    bazaar: unknown;
    checkout: unknown;
    drops: unknown;
    formqueue: unknown;
    grocery: unknown;
    health: unknown;
    inventory: unknown;
    lookup: unknown;
    more: unknown;
    notifications: unknown;
    order: unknown;
    orders: unknown;
    pnl: unknown;
    products: unknown;
    recipes: unknown;
    reconcile: unknown;
    sales: unknown;
    settings: unknown;
    shop: unknown;
    status: unknown;
    suppliers: unknown;
    today: unknown;
  };
  segMax: string | number;
  setCounted: (event?: unknown) => void;
  setInvQ: (event?: unknown) => void;
  setLookupIn: (event?: unknown) => void;
  setOrderQ: (event?: unknown) => void;
  setSaleRefIn: (event?: unknown) => void;
  setSheetQty: (event?: unknown) => void;
  setSupQ: (event?: unknown) => void;
  setTenderedIn: (event?: unknown) => void;
  settingsGroups: Array<{
    rows: Array<{
      go: (event?: unknown) => void;
      label: React.ReactNode;
      value: React.ReactNode;
    }>;
    title: React.ReactNode;
  }>;
  sheet: {
    cat: React.ReactNode;
    isAddInv: unknown;
    isCategories: unknown;
    isCloseDrop: unknown;
    isCloseout: unknown;
    isCustomers: unknown;
    isDraw: unknown;
    isDropState: unknown;
    isEditPrice: unknown;
    isEvExp: unknown;
    isExpense: unknown;
    isInvEdit: unknown;
    isNoShow: unknown;
    isOverage: unknown;
    isPay: unknown;
    isPayRules: unknown;
    isPricing: unknown;
    isProof: unknown;
    isReceive: unknown;
    isRefund: unknown;
    isReset: unknown;
    isRetention: unknown;
    isRules: unknown;
    isSpoil: unknown;
    isStatuses: unknown;
    isStorage: unknown;
    isSupplier: unknown;
    isSwap: unknown;
    isUsers: unknown;
    isWhy: unknown;
    /** Set only by OpsRuntime in live mode, owner only: `v.liveForm` should render here. */
    liveForm?: boolean;
    name: string | number;
    qty: string | number;
    title: React.ReactNode;
    unit: React.ReactNode;
    why: React.ReactNode;
  } | null;
  sheetAmountText: React.ReactNode;
  sheetName: React.ReactNode;
  sheetStyle: string | number;
  shopFlavours: Array<{
    allergens: React.ReactNode;
    available: unknown;
    desc: React.ReactNode;
    imgStyle: string | number;
    kind: React.ReactNode | null;
    minus: (event?: unknown) => void;
    name: React.ReactNode;
    picked: unknown;
    plus: (event?: unknown) => void;
    priceText: React.ReactNode;
    qty: React.ReactNode;
    soldOut: unknown;
  }>;
  showBack: unknown;
  showDock: unknown;
  showEventMoney: unknown;
  showFlowStrip: unknown;
  showMoney: unknown;
  showPhoneWidths: unknown;
  showRail: unknown;
  showTopBar: unknown;
  split: unknown;
  splitCols: string | number;
  startFirst: (event?: unknown) => void;
  statusList: Array<{
    label: React.ReactNode;
    what: React.ReactNode;
  }>;
  statusStrip: Array<{
    go: (event?: unknown) => void;
    label: React.ReactNode;
    value: React.ReactNode;
  }>;
  stock: {
    cancel: (event?: unknown) => void;
    done: (event?: unknown) => void;
    down: (event?: unknown) => void;
    expected: React.ReactNode;
    name: React.ReactNode;
    next: (event?: unknown) => void;
    onInput: (event?: unknown) => void;
    pause: (event?: unknown) => void;
    pos: React.ReactNode;
    prev: (event?: unknown) => void;
    progress: string | number;
    reason: string | number;
    setReason: (event?: unknown) => void;
    unit: React.ReactNode;
    up: (event?: unknown) => void;
    value: string | number;
    varianceNone: unknown;
    varianceOk: unknown;
    varianceText: React.ReactNode;
    varianceWarn: unknown;
  } | null;
  stopClick: (event?: unknown) => void;
  supQ: string | number;
  supplier: {
    countText: React.ReactNode;
    items: Array<{
      best: unknown;
      item: React.ReactNode;
      last: React.ReactNode;
      notBest: unknown;
      pack: React.ReactNode;
      prevText: React.ReactNode;
      priceText: React.ReactNode;
    }>;
    name: React.ReactNode;
    place: React.ReactNode;
  };
  supplierTabs: Array<{
    active: unknown;
    go: (event?: unknown) => void;
    label: React.ReactNode;
  }>;
  swapIntro: React.ReactNode;
  swapOptions: Array<{
    deltaText: React.ReactNode;
    go: (event?: unknown) => void;
    imgStyle: string | number;
    name: React.ReactNode;
    stockText: React.ReactNode;
  }>;
  syncBanner: unknown;
  syncDone: unknown;
  syncNow: (event?: unknown) => void;
  syncPartial: unknown;
  syncText: React.ReactNode;
  syncing: unknown;
  system: {
    bad: unknown;
    detail: React.ReactNode;
    go: (event?: unknown) => void;
    label: React.ReactNode;
    ok: unknown;
  };
  tendered: string | number;
  tiltRef: (event?: unknown) => void;
  toast: {
    msg: React.ReactNode;
    undo: unknown;
  } | null;
  toastOk: unknown;
  toastStyle: string | number;
  toastWarn: unknown;
  todayDate: React.ReactNode;
  toggleOnline: (event?: unknown) => void;
  toolGroups: Array<{
    items: Array<{
      badge: React.ReactNode | null;
      go: (event?: unknown) => void;
      icon: string;
      label: React.ReactNode;
      sub: React.ReactNode;
    }>;
    title: React.ReactNode;
  }>;
  unsynced: unknown;
  users: Array<{
    bg: string | number;
    br: string | number;
    can: React.ReactNode;
    extra: React.ReactNode | null;
    fg: string;
    name: React.ReactNode;
    role: React.ReactNode;
  }>;
  waitlist: Array<{
    contacted: unknown;
    go: (event?: unknown) => void;
    name: React.ReactNode;
    notContacted: unknown;
  }>;
}
