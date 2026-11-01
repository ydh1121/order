// Test-only helpers for intentional cancellation. The MSG0521 suite separately
// asserts that dirty editors require this prompt and that Continue loses nothing.
export async function discardPromptIfOpen(page){
 const prompt=page.locator('#order-discard-dialog[open]');
 if(!await prompt.count())return false;
 await prompt.locator('[data-discard-confirm]').click();
 await prompt.waitFor({state:'hidden'});
 return true;
}

export async function closedAfterExplicitDiscard(page,id){
 await page.waitForFunction(id=>!!document.querySelector('#order-discard-dialog[open]')||!document.getElementById(id)?.open,id);
 await discardPromptIfOpen(page);
 await page.waitForFunction(id=>!document.getElementById(id)?.open,id);
 await page.locator('#'+id).waitFor({state:'hidden'});
}
