// Inactive V377 bridge from workshop-api sessionUser(token) to the
// inspection boundary's verified session shape. Never trust client input.
const permitted = user => user?.role === 'Manager' ||
  (user?.id === 'SUP003' && ['Supervisor','Mechanical Supervisor'].includes(user.role));
export function createMechanicalInspectionSessionVerifier({sessionUser,token,expectedActor}={}){
 return async function verifySession(){
  if(typeof sessionUser!=='function'||typeof token!=='string'||!token||
     !expectedActor?.id) return null;
  const user=await sessionUser(token);
  if(!user||!permitted(user)||user.id!==expectedActor.id||
     user.role!==expectedActor.role||
     user.department!==expectedActor.department)return null;
  return {id:user.id,role:user.role,department:user.department,active:true};
 };
}
