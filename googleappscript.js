// ============================================
//               CONFIGURATION
// ============================================
// 1. Replace this with your actual Firebase URL
const FIREBASE_URL = "YOUR FIREBASE URL"; 

// 2. This searches your Gmail for unread NovaPay emails
const GMAIL_SEARCH_QUERY = 'is:unread "JAVAGOAT"'; 
const PROCESSED_LABEL_NAME = "Auto-Confirmed";

function main() {
  const threads = GmailApp.search(GMAIL_SEARCH_QUERY);
  Logger.log("Found " + threads.length + " potential NovaPay threads.");

  const processedLabel = getOrCreateLabel(PROCESSED_LABEL_NAME);

  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const message of messages) {
      
      if (message.isUnread()) {
        const content = message.getSubject() + " " + message.getPlainBody();
        
        // This regex looks for TXN followed by exactly 12 digits
        const match = content.match(/TXN\s*(\d{12})/i);

        if (match && match[1]) {
          const txnId = match[1]; // This is the 12 digit number
          Logger.log("Attempting to confirm Txn ID: " + txnId);
          
          const success = confirmOrder(txnId);

          if (success) {
            Logger.log("SUCCESS: " + txnId + " confirmed in Firebase. Marking as read.");
            message.markRead();
            thread.addLabel(processedLabel);
          } else {
            Logger.log("FAILED: " + txnId + " was not found in your Firebase database.");
          }
        } else {
          Logger.log("Skipping message: No 12-digit Transaction ID found.");
        }
      }
    }
  }
}

// ============================================
// DATABASE FUNCTION (Bypasses Indexing Rules)
// ============================================
function confirmOrder(transactionId) {
  try {
    // 1. Fetch ALL transactions from Firebase
    const queryUrl = FIREBASE_URL + "/transactions.json";
    const queryResponse = UrlFetchApp.fetch(queryUrl, { "muteHttpExceptions": true });
    
    if (queryResponse.getResponseCode() !== 200) {
      Logger.log("Firebase Connection Error: " + queryResponse.getContentText());
      return false;
    }

    const allTransactions = JSON.parse(queryResponse.getContentText());

    if (!allTransactions) {
      Logger.log("Database is empty. No transactions found.");
      return false;
    }

    // 2. Search for the ID manually
    let txnKey = null;
    const searchId = String(transactionId).trim();

    for (const key in allTransactions) {
      const firebaseId = String(allTransactions[key].transaction_id).trim();
      if (firebaseId === searchId) {
        txnKey = key;
        break;
      }
    }

    if (!txnKey) {
      return false; // Not found
    }

    // 3. If found, update the status to "Confirmed"
    const updateUrl = FIREBASE_URL + "/transactions/" + txnKey + ".json";
    const options = {
      "method": "patch",
      "contentType": "application/json",
      "payload": JSON.stringify({ "order_status": "Confirmed" }),
      "muteHttpExceptions": true
    };

    const updateResponse = UrlFetchApp.fetch(updateUrl, options);
    const updateData = JSON.parse(updateResponse.getContentText());

    return (updateData && updateData.order_status === "Confirmed");

  } catch (e) {
    Logger.log("Error: " + e.toString());
    return false;
  }
}

function getOrCreateLabel(labelName) {
  let label = GmailApp.getUserLabelByName(labelName);
  if (!label) { label = GmailApp.createLabel(labelName); }
  return label;
}
