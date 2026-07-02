/* ============================================================
   firebase.js — Northern Flow
   Firebase config + all Auth / Firestore helper functions.
   Every page imports what it needs from this one file.
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  increment,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ------------------------------------------------------------
   1. YOUR FIREBASE CONFIG
   Replace the values below with the config object from
   Firebase Console → Project settings → General → Your apps.
   See SETUP.md for step-by-step instructions.
------------------------------------------------------------- */
const firebaseConfig = {
  apiKey: "AIzaSyAHUcIvhp8lwet5sYB7EoMn4V-ng1e5qCc",
  authDomain: "northern-flow-data.firebaseapp.com",
  databaseURL: "https://northern-flow-data-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "northern-flow-data",
  storageBucket: "northern-flow-data.firebasestorage.app",
  messagingSenderId: "222771851056",
  appId: "1:222771851056:web:779171d485d00a269222f5",
  measurementId: "G-FKJEPXEKG7"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* ------------------------------------------------------------
   2. CONSTANTS
   Northern Flow currently sells one product, but SIZES / the
   PRODUCT_ID pattern is built so more products can be added
   later without changing the data shape.
------------------------------------------------------------- */
export const SIZES = ["S", "M", "L", "XL", "XXL"];
export const LOW_STOCK_THRESHOLD = 2;
export const PRODUCT_ID = "northern-flow-tee";

/* ------------------------------------------------------------
   3. AUTH HELPERS
------------------------------------------------------------- */
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function login(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function logout() {
  return signOut(auth);
}

/* ------------------------------------------------------------
   4. PRODUCT HELPERS
   products/{PRODUCT_ID} = {
     name, sku, costPrice, sellingPrice, image,
     sizes: { S: {stock, sold}, M: {...}, L: {...}, XL: {...}, XXL: {...} },
     createdAt
   }
------------------------------------------------------------- */
export async function getProduct() {
  const ref = doc(db, "products", PRODUCT_ID);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchProduct(callback) {
  const ref = doc(db, "products", PRODUCT_ID);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function createProductIfMissing(defaults) {
  const ref = doc(db, "products", PRODUCT_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, defaults);
  }
  return snap.exists();
}

export async function updateProductDetails(fields) {
  const ref = doc(db, "products", PRODUCT_ID);
  await setDoc(ref, fields, { merge: true });
}

/**
 * Add newly-received stock to a size (Add Stock action).
 *
 * IMPORTANT: dot-notation strings like "sizes.M.stock" are only parsed
 * as field paths by Firestore's updateDoc(). setDoc(..., {merge:true})
 * does NOT parse dots in a key — it stores the dotted string as one
 * literal field name, which silently corrupts the document instead of
 * updating the real nested field.
 *
 * setDoc(..., {merge:true}) DOES correctly do a recursive merge on
 * genuinely nested plain objects, though: passing
 * { sizes: { M: { stock: increment(5) } } } only overwrites
 * sizes.M.stock and leaves sizes.M.sold and every other size alone.
 * So the fix is simply: no dots, real nesting.
 */
export async function addStock(size, amount) {
  const ref = doc(db, "products", PRODUCT_ID);
  await setDoc(
    ref,
    { sizes: { [size]: { stock: increment(amount) } } },
    { merge: true }
  );
}

/** Overwrite a size's stock count directly (Update Quantity action) */
export async function setSizeStock(size, newStock) {
  const ref = doc(db, "products", PRODUCT_ID);
  await setDoc(
    ref,
    { sizes: { [size]: { stock: newStock } } },
    { merge: true }
  );
}

/* ------------------------------------------------------------
   5. SALES HELPERS
   sales/{saleId} = {
     productId, productName, size, quantity,
     unitPrice, costPrice, revenue, profit, date, timestamp
   }
------------------------------------------------------------- */
export async function recordSale({
  size,
  quantity,
  sellingPrice,
  costPrice,
  productName,
  shippingCost,
  shippingCharged,
}) {
  // Firestore rejects `undefined` field values outright, so guard every
  // value that could be missing (e.g. if the product doc was created
  // before name/costPrice/sellingPrice were ever saved on it).
  const safeSellingPrice = sellingPrice ?? 0;
  const safeCostPrice = costPrice ?? 0;
  const safeProductName = productName ?? "Unknown Product";
  const safeShippingCost = shippingCost ?? 0;
  const safeShippingCharged = shippingCharged ?? 0;

  const itemRevenue = safeSellingPrice * quantity;
  const itemProfit = (safeSellingPrice - safeCostPrice) * quantity;

  // Revenue shown to the seller includes whatever was charged to the
  // customer for shipping. Profit reflects the courier cost actually
  // paid out, netted against what was collected for shipping — so if
  // you charge more than the courier costs, that spread adds to profit;
  // if you undercharge or absorb shipping, profit takes the hit.
  const revenue = itemRevenue + safeShippingCharged;
  const profit = itemProfit + (safeShippingCharged - safeShippingCost);
  const now = new Date();

  await addDoc(collection(db, "sales"), {
    productId: PRODUCT_ID,
    productName: safeProductName,
    size,
    quantity,
    unitPrice: safeSellingPrice,
    costPrice: safeCostPrice,
    shippingCost: safeShippingCost,
    shippingCharged: safeShippingCharged,
    revenue,
    profit,
    date: now.toISOString().slice(0, 10),
    timestamp: Timestamp.fromDate(now),
  });

  const productRef = doc(db, "products", PRODUCT_ID);
  await setDoc(
    productRef,
    {
      sizes: {
        [size]: {
          stock: increment(-quantity),
          sold: increment(quantity),
        },
      },
    },
    { merge: true }
  );

  return { revenue, profit };
}

export function watchSales(callback, max = 500) {
  const q = query(collection(db, "sales"), orderBy("timestamp", "desc"));
  return onSnapshot(q, (snap) => {
    const sales = [];
    snap.forEach((d) => sales.push({ id: d.id, ...d.data() }));
    callback(sales.slice(0, max));
  });
}

export async function getAllSales() {
  const q = query(collection(db, "sales"), orderBy("timestamp", "desc"));
  const snap = await getDocs(q);
  const sales = [];
  snap.forEach((d) => sales.push({ id: d.id, ...d.data() }));
  return sales;
}