// fetch/lib/errorHandler.mjs

const MAX_ERRORS_THRESHOLD = 20; // Default threshold for maximum errors

let errorList = [];
let errorThreshold = MAX_ERRORS_THRESHOLD;

/**
 * Adds an item to the global error list.
 * @param {any} item - The item that caused an error, can be a URL, an ID, or an object with details.
 * @param {string} scriptName - Name of the script where the error occurred (for better logging).
 * @param {string} [errorMessage='No error message provided'] - Optional error message.
 */
function addItemToErrorList(item, scriptName, errorMessage = 'No error message provided') {
  const errorDetail = {
    item,
    scriptName,
    timestamp: new Date().toISOString(),
    errorMessage,
    retries: 0, // Initialize retry count
  };
  errorList.push(errorDetail);
  console.log(`ERROR_HANDLER: [${scriptName}] Error added for item. Total errors: ${errorList.length}. Item: ${JSON.stringify(item)}, Message: ${errorMessage}`);
}

/**
 * Retrieves the current list of errors.
 * @returns {Array} The list of error items.
 */
function getErrorList() {
  return [...errorList]; // Return a copy to prevent direct modification
}

/**
 * Gets the current count of errors.
 * @returns {number} The number of items in the error list.
 */
function getErrorCount() {
  return errorList.length;
}

/**
 * Clears the global error list.
 * Typically called after a successful retry session or when starting a new batch.
 */
function clearErrorList() {
  errorList = [];
  console.log("ERROR_HANDLER: Error list cleared.");
}

/**
 * Sets a new threshold for maximum allowable errors.
 * @param {number} threshold - The new maximum error threshold.
 */
function setErrorThreshold(threshold) {
  if (typeof threshold === 'number' && threshold > 0) {
    errorThreshold = threshold;
    console.log(`ERROR_HANDLER: Max error threshold set to ${threshold}.`);
  } else {
    console.error(`ERROR_HANDLER: Invalid threshold value provided: ${threshold}. Must be a positive number.`);
  }
}

/**
 * Gets the current maximum error threshold.
 * @returns {number} The current threshold.
 */
function getErrorThreshold() {
  return errorThreshold;
}

/**
 * Increments the retry count for a specific error item.
 * @param {object} errorItem - The error item object from the error list.
 */
function incrementRetryCount(errorItem) {
    const itemInList = errorList.find(e => e.timestamp === errorItem.timestamp && JSON.stringify(e.item) === JSON.stringify(errorItem.item));
    if (itemInList) {
        itemInList.retries = (itemInList.retries || 0) + 1;
    }
}

export {
  addItemToErrorList,
  getErrorList,
  getErrorCount,
  clearErrorList,
  setErrorThreshold,
  getErrorThreshold,
  MAX_ERRORS_THRESHOLD,
  incrementRetryCount,
};
