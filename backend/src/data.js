const creators=[
{id:"cr_001",name:"Ananya Kapoor",niche:"Fashion",followers:245000,engagement:4.8,city:"Hyderabad",language:"English",verified:true,trustScore:96},
{id:"cr_002",name:"Rahul Sharma",niche:"Tech",followers:180000,engagement:5.2,city:"Bengaluru",language:"English",verified:true,trustScore:94},
{id:"cr_003",name:"Priya Singh",niche:"Lifestyle",followers:320000,engagement:4.4,city:"Mumbai",language:"Hindi",verified:true,trustScore:93},
{id:"cr_004",name:"Vikram Mehta",niche:"Gaming",followers:150000,engagement:6.1,city:"Pune",language:"English",verified:false,trustScore:91},
{id:"cr_005",name:"Sneha Foods",niche:"Food",followers:48200,engagement:7.2,city:"Hyderabad",language:"Telugu",verified:true,trustScore:92},
{id:"cr_006",name:"Foodie Pradeep",niche:"Food",followers:76500,engagement:6.8,city:"Hyderabad",language:"Telugu",verified:true,trustScore:90}
];
const campaigns=[
{id:"cam_001",name:"Fashion Brand Campaign",status:"active",budget:85000,creators:12,reach:285000,createdAt:"2026-10-01"},
{id:"cam_002",name:"Tech Launch Campaign",status:"active",budget:120000,creators:8,reach:410000,createdAt:"2026-09-22"},
{id:"cam_003",name:"Food Festival Campaign",status:"completed",budget:45000,creators:6,reach:175000,createdAt:"2026-09-10"}
];
const activities=[
{id:"act_001",type:"campaign",message:"New campaign created",detail:"Fashion Brand Campaign",time:"10m ago"},
{id:"act_002",type:"match",message:"AI matched 24 creators",detail:"Tech Campaign",time:"32m ago"},
{id:"act_003",type:"payment",message:"Payment completed",detail:"₹45,000 transferred",time:"1h ago"}
];
const trending=[
{name:"Creative Studio",growth:42,engagement:8.1},
{name:"Pixel Queen",growth:36,engagement:7.4},
{name:"MediaX",growth:31,engagement:6.9}
];
const monthlyPerformance=[
{month:"May",revenue:58000},{month:"Jun",revenue:72000},{month:"Jul",revenue:69000},
{month:"Aug",revenue:88000},{month:"Sep",revenue:81000},{month:"Oct",revenue:102000}
];
module.exports={creators,campaigns,activities,trending,monthlyPerformance};