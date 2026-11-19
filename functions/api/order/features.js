// The product only consumes the operator's published switch. Customer headers,
// credentials and input never cross to the IA host.
export async function onRequest({request}) {
  const headers = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if (request.method !== 'GET') return new Response(null,{status:405,headers:{...headers,Allow:'GET'}});
  if (new URL(request.url).search) return Response.json({orderMenu:false},{status:400,headers});
  let orderMenu = false;
  try {
    const response = await fetch('https://order-ia-portal.pages.dev/api/order/features',{
      method:'GET',credentials:'omit',redirect:'error',headers:{Accept:'application/json'},
      signal:AbortSignal.timeout(2500)
    });
    if (response.ok && response.headers.get('Content-Type')?.includes('application/json')) {
      const data = await response.json();
      orderMenu = data?.orderMenu === true;
    }
  } catch { /* An unavailable publication keeps the current product navigation. */ }
  return Response.json({orderMenu},{headers});
}
