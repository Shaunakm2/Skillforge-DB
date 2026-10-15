/* Skillforge LMS — mock data and shared helpers.
 * Replace these constants with API calls (e.g. Supabase) when wiring a backend. */
const AV = ['#DCEAF4','#D6EBE6','#EADCF0','#FAD9D0','#DCE5F3'];
const ini = n => n.split(' ').map(w => w[0]).join('').slice(0, 2);
const fmt = n => n.toLocaleString('en-US');
const COURSES = [
  { id:'change', title:'Leading Through Change', cat:'Leadership', instructor:'Daniel Reyes', hours:'3h 20m', progress:50, color:'#0066A1', tint:'#E7F0F7', rating:4.8, learners:1240, xp:900, level:'Intermediate', desc:'Help your team move from uncertainty to ownership. Practice telling the change story, listening for resistance, and keeping momentum after launch.' },
  { id:'feedback', title:'Giving Feedback That Lands', cat:'Communication', instructor:'Amara Lindqvist', hours:'2h 10m', progress:42, color:'#007A4D', tint:'#E3F1EE', rating:4.9, learners:2310, xp:700, level:'Foundational', required:true, desc:'A practical approach to specific, timely feedback that people can act on, in person and in async teams.' },
  { id:'oneonones', title:'Running Effective 1:1s', cat:'Leadership', instructor:'Daniel Reyes', hours:'1h 30m', progress:100, color:'#8C5A9E', tint:'#F1E7F4', rating:4.7, learners:1875, xp:500, level:'Foundational', desc:'Structure 1:1s around the other person. Agendas, questions that open up the conversation, and follow-through.' },
  { id:'negotiation', title:'Negotiation Essentials', cat:'Communication', instructor:'Kofi Mensah', hours:'2h 45m', progress:0, color:'#D64545', tint:'#FDECEC', rating:4.6, learners:980, xp:800, level:'Intermediate', required:true, desc:'Prepare, anchor, and find trades that work for both sides. Includes a live role-play workshop.' },
  { id:'eq', title:'Emotional Intelligence at Work', cat:'Self-management', instructor:'Amara Lindqvist', hours:'2h', progress:0, color:'#007A4D', tint:'#E3F1EE', rating:4.8, learners:3120, xp:650, level:'Foundational', desc:'Notice your reactions, read the room, and respond with intent rather than habit.' },
  { id:'present', title:'Presenting with Confidence', cat:'Communication', instructor:'Sofia Marino', hours:'1h 50m', progress:17, color:'#0066A1', tint:'#E7F0F7', rating:4.5, learners:1460, xp:600, level:'Foundational', required:true, desc:'Build a clear storyline, handle questions, and manage nerves in front of any audience.' },
  { id:'coaching', title:'Coaching Conversations', cat:'Leadership', instructor:'Kofi Mensah', hours:'2h 30m', progress:0, color:'#8C5A9E', tint:'#F1E7F4', rating:4.9, learners:760, xp:850, level:'Advanced', desc:'Use the GROW model and powerful questions to help people solve their own problems.' },
  { id:'inclusive', title:'Inclusive Leadership', cat:'Collaboration', instructor:'Sofia Marino', hours:'2h 15m', progress:0, color:'#D64545', tint:'#FDECEC', rating:4.7, learners:2040, xp:700, level:'Intermediate', desc:'Make room for every voice in meetings, decisions, and day-to-day work.' },
  { id:'energy', title:'Managing Time & Energy', cat:'Self-management', instructor:'Daniel Reyes', hours:'1h 15m', progress:0, color:'#007A4D', tint:'#E3F1EE', rating:4.4, learners:2650, xp:450, level:'Foundational', desc:'Plan your week around energy, protect focus time, and say no without guilt.' },
];
const MODS = [
  { title:'Why change is hard', lessons:[['The change curve','Video',8],['Your reaction to change','Reflection',5],['Knowledge check','Quiz',4]] },
  { title:'Building the case', lessons:[['Telling the change story','Video',10],['Stakeholder mapping','Reading',7],['Draft your change story','Activity',12]] },
  { title:'Leading people through it', lessons:[['Listening for resistance','Video',9],['Responding to pushback','Video',11],['Scenario quiz','Quiz',6]] },
  { title:'Sustaining momentum', lessons:[['Creating quick wins','Video',7],['Measuring adoption','Reading',6],['Final assessment','Quiz',15]] },
];
const FLAT = [];
MODS.forEach((m, mi) => m.lessons.forEach((l, li) => FLAT.push({ key: mi + '-' + li, mi, li, title: l[0], type: l[1], min: l[2], module: m.title })));
const QUIZ = [
  { q:'A team member says, "We tried this two years ago and it failed." What is the most useful first response?', opts:['Explain why this time is different.','Ask what happened last time and what they would want to avoid.','Remind them the decision has already been made.','Raise it with their manager.'], a:1, why:'Curiosity surfaces the real concern and gives you something to act on. Defending the change first tends to harden resistance.' },
  { q:'Which behavior is the clearest sign of passive resistance?', opts:['Asking a lot of questions in the kickoff','Agreeing in meetings but missing related deadlines','Openly disagreeing with the plan','Suggesting an alternative approach'], a:1, why:'Visible disagreement is a form of engagement. Silent non-follow-through is harder to spot and usually needs a direct, private conversation.' },
  { q:'When is the best time to share the "why" behind a change?', opts:['After the rollout is complete','Only when someone asks','Before announcing what will change','In the project retrospective'], a:2, why:'People evaluate the "what" through the lens of the "why". Leading with purpose gives them a reason to engage with the details.' },
  { q:'A high performer goes quiet after the announcement. What should you do?', opts:['Give them space until they come around','Schedule a 1:1 to ask how the change affects their work','Ask them to lead the rollout','Mention it in team standup'], a:1, why:'Withdrawal often signals a personal cost that has not been named. A private 1:1 makes it safe to raise.' },
  { q:'Which message best acknowledges loss during a change?', opts:['"This is exciting for everyone."','"I know the old process worked well for you, and losing it is a real cost."','"Change is part of the job."','"You will get used to it quickly."'], a:1, why:'Naming what people are giving up builds trust. Skipping straight to the upside can feel dismissive.' },
];
const TEAM = [
  { name:'Maya Okafor', title:'CS Specialist', team:'Customer Success', xp:8420, you:true, pct:62, assigned:3, overdue:0, active:'today' },
  { name:'Jonas Berg', title:'Senior CSM', team:'Customer Success', xp:9150, pct:88, assigned:3, overdue:0, active:'today' },
  { name:'Aisha Khan', title:'CSM', team:'Customer Success', xp:7980, pct:74, assigned:2, overdue:0, active:'yesterday' },
  { name:'Tomás Rivera', title:'CS Specialist', team:'Customer Success', xp:6210, pct:51, assigned:3, overdue:1, active:'2d ago' },
  { name:'Lena Park', title:'Onboarding Lead', team:'Customer Success', xp:5540, pct:40, assigned:2, overdue:1, active:'3d ago' },
  { name:'Ravi Patel', title:'CS Specialist', team:'Customer Success', xp:4300, pct:28, assigned:3, overdue:2, active:'6d ago' },
  { name:'Emma Clarke', title:'CSM', team:'Customer Success', xp:3890, pct:66, assigned:2, overdue:0, active:'today' },
];
const COMPANY = [
  { name:'Sana Iqbal', team:'Sales', xp:14820 }, { name:'Marco Bianchi', team:'Engineering', xp:13405 }, { name:'Grace Liu', team:'Operations', xp:12990 },
  { name:'Hugo Laurent', team:'Marketing', xp:12110 }, { name:'Nia Brooks', team:'Sales', xp:11870 }, { name:'Felix Wong', team:'Finance', xp:11420 },
];
const EVENTS = {
  '2026-09-24': [{ t:'Feedback cohort kickoff', time:'10:00 AM', kind:'live' }],
  '2026-10-06': [{ t:'Coaching clinic', time:'2:00 – 3:00 PM', kind:'live' }],
  '2026-10-08': [{ t:'Due: Giving Feedback, Module 3', time:'End of day', kind:'due' }],
  '2026-10-14': [{ t:'Live Q&A with Daniel Reyes', time:'11:00 – 11:45 AM', kind:'live' }],
  '2026-10-16': [{ t:'Due: Leading Through Change', time:'End of day', kind:'due' }],
  '2026-10-21': [{ t:'Team learning hour', time:'4:00 – 5:00 PM', kind:'team' }],
  '2026-10-27': [{ t:'Negotiation role-play', time:'10:00 AM – 12:00 PM', kind:'live' }],
  '2026-10-30': [{ t:'Due: Presenting with Confidence', time:'End of day', kind:'due' }],
  '2026-11-04': [{ t:'Inclusive Leadership cohort', time:'9:30 AM', kind:'live' }],
  '2026-11-14': [{ t:'Due: Negotiation Essentials', time:'End of day', kind:'due' }],
};
const KIND = { live:{ bg:'#E3F1EE', fg:'#245E52', label:'LIVE SESSION', dot:'#007A4D' }, due:{ bg:'#FDECEC', fg:'#A63232', label:'DEADLINE', dot:'#D64545' }, team:{ bg:'#F1E7F4', fg:'#6E4380', label:'TEAM', dot:'#8C5A9E' } };
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
/* Prototype sign-in: every demo account uses this password. Replace with real auth (e.g. Supabase Auth). */
const DEMO_PASSWORD = 'skillforge';
/* Password given to new accounts and set when an admin resets a password. */
let DEFAULT_PASSWORD = 'Pass@123';   // changeable in Settings › Master data › App settings

/* Three user types. Everyone has the learner experience; trainers and admins also get Settings (gear icon).
   - Learner (trainee): assigned courses, catalog, learning paths, calendar, discussions.
   - Trainer: learner access + Settings with batch management, course assignment, attempts, gradebook, course builder.
   - Admin: learner access + Settings with every module. */
const ROLES = [
  { id:'learner', label:'Learner', name:'Maya Okafor', who:'Maya Okafor · CS Specialist', home:'home', nav:[['home','Home'],['catalog','Catalog'],['progress','My learning'],['calendar','Calendar'],['discussions','Discussions'],['docs','Documents']] },
  { id:'instructor', label:'Trainer', name:'Daniel Reyes', who:'Daniel Reyes · Leadership coach', home:'home', trainer:true, nav:[['home','Home'],['catalog','Catalog'],['progress','My learning'],['calendar','Calendar'],['discussions','Discussions'],['docs','Documents']] },
  { id:'admin', label:'Admin', name:'Lena Fischer', who:'Lena Fischer · L&D Operations', home:'home', admin:true, nav:[['home','Home'],['catalog','Catalog'],['progress','My learning'],['calendar','Calendar'],['discussions','Discussions'],['docs','Documents']] },
];
const PARENT = { item:'catalog', course:'catalog', lesson:'catalog', quiz:'catalog', quizBuild:'quizzes', batch:'batches', attempts:'attempts' };
const THREADS = [
  { id:1, course:'Leading Through Change', title:'How do you handle "we tried this before"?', author:'Aisha Khan', time:'2h ago', votes:24, body:'Rolling out the new ticket triage flow and I keep hearing that we tried something similar in 2024. I don\'t want to dismiss it, but I also can\'t relitigate the decision every standup. What has worked for you?', replies:[
    { author:'Daniel Reyes', instructor:true, time:'1h ago', body:'Treat it as information, not opposition. Ask what went wrong last time and write it down where the team can see it. Then show which of those risks you have planned for.' },
    { author:'Tomás Rivera', time:'48m ago', body:'We did a 15-minute "what bit us last time" session. It turned the loudest skeptic into the person who caught our biggest gap.' } ] },
  { id:2, course:'Giving Feedback That Lands', title:'Feedback templates for async teams?', author:'Jonas Berg', time:'Yesterday', votes:17, body:'Half my team is in another timezone. Written feedback keeps coming across harsher than I mean it. Does anyone have a structure they use in Slack or docs?', replies:[
    { author:'Emma Clarke', time:'20h ago', body:'I use situation, behavior, impact, then one question. The question at the end makes it a conversation instead of a verdict.' } ] },
  { id:3, course:'Running Effective 1:1s', title:'The best question you\'ve asked in a 1:1', author:'Lena Park', time:'3d ago', votes:41, body:'Mine lately: "What is something you are doing that you wish you could stop doing?" Surprisingly revealing. Share yours.', replies:[
    { author:'Ravi Patel', time:'3d ago', body:'"What would make next week a great week for you?" Simple, but it gets people talking about priorities.' },
    { author:'Maya Okafor', time:'2d ago', body:'"Where are you getting stuck waiting on someone else?" Usually uncovers a blocker I can actually help with.' } ] },
  { id:4, course:'Negotiation Essentials', title:'Looking for a role-play partner before the workshop', author:'Ravi Patel', time:'4d ago', votes:6, body:'The workshop on the 27th has a prep exercise. Anyone want to pair up for 30 minutes next week?', replies:[] },
];
const GB = [
  ['Maya Okafor','Customer Success',[92,88,84,null]],['Jonas Berg','Customer Success',[96,90,94,91]],['Aisha Khan','Customer Success',[85,92,78,null]],
  ['Sana Iqbal','Sales',[100,95,97,93]],['Marco Bianchi','Engineering',[74,80,null,null]],['Grace Liu','Operations',[88,70,81,86]],
  ['Felix Wong','Finance',[62,75,58,null]],['Nia Brooks','Sales',[90,85,88,null]],
];
const LESSON_COPY = {
  'Listening for resistance': { body:'Resistance rarely shows up as a direct "no". It sounds like questions about timing, stories about the last attempt, or a sudden focus on edge cases. This lesson shows you how to hear the concern underneath and respond to that instead of to the words.', points:['Resistance is information about what people value or fear losing.','Ask one more question before you answer an objection.','Reflect back what you heard so people know it registered.'] },
};
const TRANSCRIPT = [{ at:'0:00', t:'When we announce a change, most of us listen for agreement.' }, { at:'0:18', t:'The more useful thing to listen for is what people are worried about losing.' }, { at:'0:41', t:'Let\'s look at three phrases you\'ll hear in almost every rollout.' }, { at:'1:05', t:'The first one is: "We tried this before."' }];

const GRP={home:'Learn',catalog:'Learn',progress:'Learn',calendar:'Learn',discussions:'Learn',docs:'Learn',builder:'Create',gradebook:'Create',qbank:'Create',quizzes:'Create',courseAdmin:'Create',team:'Manage',reports:'Measure',users:'Admin'};
const TRAINER_NAV = [['batches','Batches'],['assignments','Course assignment'],['gradebook','Gradebook']];   // v41: attempts are admin-only by default
const ADMIN_NAV = [['qbank','Questions'],['quizzes','Quizzes'],['lcms','LCMS'],['courseAdmin','Course catalog'],['batches','Batches'],['reports','Reports'],['users','Users']];
const DEPTS = ['Customer Success','Sales','Engineering','Operations','Marketing','Finance','Learning & Development','IT'];
const DIFF = { Easy:['#DCFCE7','#166534'], Medium:['#FEF3C7','#92400E'], Hard:['#FEE2E2','#991B1B'] };
const VIVIDS = ['#7C5CFF','#0066A1','#08AE6E','#2563EB','#FF6B4A','#DB2777','#22C55E'];
const VIVID_FG = { '#7C5CFF':'#FFFFFF', '#0066A1':'#16324F', '#08AE6E':'#16324F', '#2563EB':'#FFFFFF', '#FF6B4A':'#16324F', '#DB2777':'#FFFFFF', '#22C55E':'#16324F' };
/* Question bank.
 * type:  'Multiple choice' | 'Multiple select' | 'True / False' | 'Image options' | 'Match the following'
 *        'Likert scale' | 'Fill in the blank' | 'Ordering' | 'Written answer'
 * opts / ans / why   single-answer questions (ans = index of the correct option; Image options: opts = [{ src, label }])
 * answers            Multiple select: indexes of every correct option
 * pairs              Match the following: [[left, right], ...] in matching order
 * accept             Fill in the blank: accepted answers (case-insensitive)
 * items              Ordering: items in the correct order
 * Likert scale       opinion question, 5-point agree scale, not scored
 * points / guide     written answers: rating scale (0..points) and what the trainer looks for
 * media              optional { kind:'image'|'audio'|'video', src, name } shown with the question */
const MEDIA_DIR = 'assets/media/';
const Q_AUTHOR = { 'Change management':'Daniel Reyes', 'Feedback':'Kofi Mensah', 'Coaching':'Daniel Reyes', 'Negotiation':'Lena Fischer', '1:1s':'Kofi Mensah', 'Workplace safety':'Lena Fischer' };
const QBANK0 = [
  { text:QUIZ[0].q, topic:'Change management', type:'Multiple choice', diff:'Medium', opts:QUIZ[0].opts, ans:QUIZ[0].a, why:QUIZ[0].why },
  { text:QUIZ[1].q, topic:'Change management', type:'Multiple choice', diff:'Medium', opts:QUIZ[1].opts, ans:QUIZ[1].a, why:QUIZ[1].why },
  { text:'Sharing the "why" before the "what" increases buy-in.', topic:'Change management', type:'True / False', diff:'Easy', opts:['True','False'], ans:0, why:'People judge what is changing through the reason for it. Leading with purpose gives them a frame for everything that follows.' },
  { text:QUIZ[3].q, topic:'Change management', type:'Multiple choice', diff:'Hard', opts:QUIZ[3].opts, ans:QUIZ[3].a, why:QUIZ[3].why },
  { text:'Which three elements make up the SBI feedback model?', topic:'Feedback', type:'Multiple choice', diff:'Easy', opts:['Situation, Behavior, Impact','Strength, Barrier, Idea','Summary, Benefit, Insight','Situation, Belief, Intent'], ans:0, why:'SBI anchors feedback in a specific situation, the observable behavior, and its impact.' },
  { text:'Feedback is most effective when it is delivered within a week of the behavior.', topic:'Feedback', type:'True / False', diff:'Easy', opts:['True','False'], ans:0, why:'The closer feedback is to the moment, the easier it is to recall and act on.' },
  { text:'Describe how you would give written feedback to a remote colleague.', topic:'Feedback', type:'Written answer', diff:'Medium', points:5, guide:'Uses a clear structure such as SBI, gives a specific example, and offers a follow-up conversation.' },
  { text:'In the GROW model, what does the "O" stand for?', topic:'Coaching', type:'Multiple choice', diff:'Easy', opts:['Outcome','Options','Obstacles','Ownership'], ans:1, why:'GROW is Goal, Reality, Options, Will.' },
  { text:'A coachee asks you for the answer. What should you do first?', topic:'Coaching', type:'Multiple choice', diff:'Hard', opts:['Give the answer to save time','Ask what they have already considered','Refer them to their manager','Share a similar story'], ans:1, why:'Asking what they have considered keeps ownership with the coachee.' },
  { text:'What is a BATNA?', topic:'Negotiation', type:'Multiple choice', diff:'Medium', opts:['Best alternative to a negotiated agreement','Basic agreement terms and notes','Bargaining approach to a new arrangement','Best agreed target number'], ans:0, why:'Your BATNA is what you will do if no deal is reached. It sets your walk-away point.' },
  { text:'Making the first offer is always a disadvantage.', topic:'Negotiation', type:'True / False', diff:'Medium', opts:['True','False'], ans:1, why:'A well-prepared first offer can anchor the negotiation in your favor.' },
  { text:'Which question best opens a 1:1?', topic:'1:1s', type:'Multiple choice', diff:'Easy', opts:['What is the status of your projects?','What is on your mind this week?','Did you finish the report?','Any blockers I should escalate?'], ans:1, why:'An open question lets the other person set the agenda.' },
  { text:QUIZ[2].q, topic:'Change management', type:'Multiple choice', diff:'Easy', opts:QUIZ[2].opts, ans:QUIZ[2].a, why:QUIZ[2].why },
  { text:QUIZ[4].q, topic:'Change management', type:'Multiple choice', diff:'Medium', opts:QUIZ[4].opts, ans:QUIZ[4].a, why:QUIZ[4].why },
  { text:'Look at the chart. Which stage of change is marked with the red dot?', topic:'Change management', type:'Multiple choice', diff:'Medium', opts:['The initial shock','The dip, where morale is lowest','Acceptance','Full integration'], ans:1, why:'Performance usually dips after an announcement before it recovers. This is when people need the most support.', media:{ kind:'image', src:MEDIA_DIR + 'change-curve.svg', name:'change-curve.svg' } },
  { text:'Listen to the clip. What is the team member showing?', topic:'Change management', type:'Multiple choice', diff:'Medium', opts:['Open disagreement','Passive resistance','Full commitment','A request for training'], ans:1, why:'They agreed in the meeting but are not acting on it. That gap between words and action is passive resistance.', media:{ kind:'audio', src:MEDIA_DIR + 'pushback-clip.mp3', name:'pushback-clip.mp3' } },
  { text:'Watch the clip. Which behavior does the manager show?', topic:'Change management', type:'Multiple choice', diff:'Easy', opts:['Acknowledging what the person is losing','Restating the deadline','Handing the rollout to someone else','Avoiding the topic'], ans:0, why:'Naming the loss first builds trust, and then the manager moves to what the person needs.', media:{ kind:'video', src:MEDIA_DIR + 'acknowledging-loss.mp4', name:'acknowledging-loss.mp4' } },
  { text:'A team member says the new process is slowing them down. Write how you would respond in your next 1:1.', topic:'Change management', type:'Written answer', diff:'Medium', points:5, guide:'Acknowledges the concern, asks what specifically slows them down, and agrees one concrete next step.' },
  { text:'Describe a change you led or lived through. What would you do differently now?', topic:'Change management', type:'Written answer', diff:'Hard', points:10, guide:'Gives a real example, reflects honestly on what did not work, and links the lesson to a model from the course.' },
  { text:'Which of these are signs of passive resistance? Select all that apply.', topic:'Change management', type:'Multiple select', diff:'Medium', opts:['Agreeing in meetings but missing related deadlines','Asking clarifying questions in the kickoff','Quietly sticking with the old process','Openly proposing an alternative'], answers:[0,2], why:'Passive resistance shows up as a gap between what people say and what they do. Questions and open disagreement are signs of engagement.' },
  { text:'Which chart shows the typical dip and recovery during a change?', topic:'Change management', type:'Image options', diff:'Easy', opts:[{ src:MEDIA_DIR + 'curve-rise.svg', label:'Steady rise' },{ src:MEDIA_DIR + 'curve-flat.svg', label:'No change' },{ src:MEDIA_DIR + 'curve-dip.svg', label:'Dip, then recovery' },{ src:MEDIA_DIR + 'curve-fall.svg', label:'Steady decline' }], ans:2, why:'Morale and performance usually dip after an announcement, then recover as people adjust.' },
  { text:'Match each step of the GROW model to its purpose.', topic:'Coaching', type:'Match the following', diff:'Medium', pairs:[['Goal','What do you want to achieve?'],['Reality','Where are you now?'],['Options','What could you do?'],['Will','What will you do, and by when?']], why:'GROW moves from the goal, to the current reality, to options, and finally to a commitment.' },
  { text:'I feel confident explaining the reason for a change to my team.', topic:'Change management', type:'Likert scale', diff:'Easy', why:'' },
  { text:'When people judge a change, they look first at the ___ behind it.', topic:'Change management', type:'Fill in the blank', diff:'Easy', accept:['why','reason','purpose'], why:'People evaluate the "what" through the "why". Lead with the reason.' },
  { text:'Put the steps of a change conversation in the right order.', topic:'Change management', type:'Ordering', diff:'Medium', items:['Share the reason for the change','Explain what will change','Acknowledge what people are losing','Agree the next step together'], why:'Start with why, then what, then acknowledge the cost, and close with a shared next step.' },
  { text:'You see a trailing cable across a walkway. What should you do first?', topic:'Workplace safety', type:'Multiple choice', diff:'Easy', opts:['Step over it and carry on','Warn people nearby and report it the same day','Unplug every device on the floor','Wait for the next safety audit'], ans:1, why:'Make it safe for others, then report it so it gets fixed.' },
  { text:'During a fire alarm you should use the lift if the stairs are crowded.', topic:'Workplace safety', type:'True / False', diff:'Easy', opts:['True','False'], ans:1, why:'Never use lifts in a fire. Use the nearest marked exit.' },
  { text:'Match each situation to the right action.', topic:'Workplace safety', type:'Match the following', diff:'Medium', pairs:[['Wet floor','Warn, mark the area and report'],['Fire alarm','Leave by the nearest exit'],['Overloaded power strip','Unplug what you can and report']], why:'Spot it, make it safe if you can, and report it.' },
  { text:'Where do you go after leaving the building in an emergency?', topic:'Workplace safety', type:'Multiple choice', diff:'Easy', opts:['Back to your desk','Your floor\'s assembly point','The nearest café','Home'], ans:1, why:'Wardens count people at the assembly point. Wait there for the all-clear.' },
].map((q, i) => ({ id:i + 1, used:0, author: Q_AUTHOR[q.topic] || 'Lena Fischer', created: '2026-0' + (6 + i % 3) + '-' + String(1 + (i * 7) % 28).padStart(2, '0'), ...q }));
const SAFETY_QIDS = QBANK0.filter(q => q.topic === 'Workplace safety').map(q => q.id);
const IMPORT_Q = [
  ['Which question type helps a coachee explore options?','Coaching','Multiple choice','Medium'],
  ['Silence after a coaching question usually means the person is disengaged.','Coaching','True / False','Easy'],
  ['What is the purpose of the "Will" step in GROW?','Coaching','Multiple choice','Easy'],
  ['Name one way to check commitment at the end of a coaching conversation.','Coaching','Written answer','Medium'],
  ['When is directive advice more appropriate than coaching?','Coaching','Multiple choice','Hard'],
].map(r => ({ text:r[0], topic:r[1], type:r[2], diff:r[3], ...(r[2] === 'Written answer' ? { points:5, guide:'' } : { opts: r[2] === 'True / False' ? ['True','False'] : ['Option A','Option B','Option C','Option D'], ans:0, why:'' }) }));
const QUIZZES0 = [
  { id:4, name:'Workplace safety check', ids:SAFETY_QIDS, pass:75, time:10, attempts:'3', shuffle:true, shuffleOpts:true, dynamic:false, drawCount:4, course:'Workplace Safety Essentials' },
  { id:1, name:'Change management check', ids:[1,2,3,4,13,14,15,16,17,18,19,20,21,22,23,24,25], pass:80, time:10, attempts:'2', shuffle:true, shuffleOpts:true, dynamic:true, drawCount:8, course:'Leading Through Change' },
  { id:2, name:'Feedback fundamentals', ids:[5,6], pass:70, time:0, attempts:'Unlimited', shuffle:false, shuffleOpts:true, dynamic:false, drawCount:2, course:'Giving Feedback That Lands' },
  { id:3, name:'1:1 readiness', ids:[12], pass:70, time:5, attempts:'3', shuffle:false, shuffleOpts:false, dynamic:false, drawCount:1, course:'Running Effective 1:1s' },
];
QBANK0.forEach(q => { q.used = QUIZZES0.filter(z => z.ids.includes(q.id)).length; });

/* Written answers waiting for (or already given) a trainer rating. */
const REVIEWS0 = [
  { id:'r1', learner:'Jonas Berg', quiz:'Change management check', qid:18, answer:'I would thank them for raising it, then ask them to walk me through the step that takes longest. If it is a tooling issue I will raise it with ops this week, and we will check in again on Friday.', submitted:'Today, 09:12', rating:null, feedback:'' },
  { id:'r2', learner:'Aisha Khan', quiz:'Change management check', qid:19, answer:'When we moved to the new CRM I was told about it two days before go-live. Looking back, I would have asked for the reason earlier and involved the team in testing, which is the "why before what" idea from Module 1.', submitted:'Yesterday, 16:40', rating:null, feedback:'' },
  { id:'r3', learner:'Tomás Rivera', quiz:'Change management check', qid:18, answer:'Tell them it will get easier once they are used to it.', submitted:'Oct 1, 11:05', rating:1, feedback:'This skips the concern. Ask what specifically slows them down before reassuring them.' },
  { id:'r4', learner:'Emma Clarke', quiz:'Feedback fundamentals', qid:7, answer:'I use SBI in a short message: the situation (Tuesday demo), the behavior (you handled the pricing question calmly) and the impact (the client signed). Then I offer a quick call if they want to talk it through.', submitted:'Today, 08:30', rating:null, feedback:'' },
];

/* Course assignments per trainee: { name: { courseId: dueDateKey } }. Trainers, admins and super admins assign and unassign. */
const ENROLL0 = {
  'Maya Okafor': { feedback:'2026-10-08', present:'2026-10-30', negotiation:'2026-11-14', safety:'2026-10-24' },
  'Lena Fischer': { feedback:'2026-10-08', present:'2026-10-30', negotiation:'2026-11-14' },
  'Arjun Mehta': { feedback:'2026-10-08', present:'2026-10-30', negotiation:'2026-11-14' },
  'Jonas Berg': { change:'2026-10-16', feedback:'2026-10-08', coaching:'2026-11-20' },
  'Daniel Reyes': { change:'2026-10-16', inclusive:'2026-11-06', safety:'2026-10-24' },
  'Kofi Mensah': { change:'2026-10-16', coaching:'2026-11-20' },
  'Aisha Khan': { change:'2026-10-16', negotiation:'2026-11-14' },
  'Sana Iqbal': { negotiation:'2026-11-14', present:'2026-10-30' },
  'Marco Bianchi': { eq:'2026-11-05' },
  'Grace Liu': { energy:'2026-11-12', feedback:'2026-10-08' },
};
/* Quiz attempts used, and extra attempts granted by an admin: { name: { quizId: n } } */
const ATTEMPTS_USED0 = { 'Jonas Berg': { 1:2 }, 'Aisha Khan': { 1:1, 2:1 }, 'Sana Iqbal': { 3:3 } };
const EXTRA_ATTEMPTS0 = { 'Aisha Khan': { 1:1 } };
/* Log of extra attempts given from Assessment attempt management. */
const ATTEMPT_LOG0 = [{ id:'al1', at:'2026-09-30T15:20', by:'Lena Fischer', role:'Admin', user:'Aisha Khan', course:'Leading Through Change', courseCode:'CRS-1002', quiz:'Change management check', n:1, reason:'Missed the assessment window due to a client escalation.' }];

/* Homepage announcements. Live between "from" and "until". */
const ANNS0 = [
  { id:1, title:'Q4 compliance training is open', msg:'Complete the Code of Conduct refresher by October 31. It takes about 25 minutes.', tone:'Important', from:'2026-10-01T09:00', until:'2026-10-31T23:59' },
  { id:2, title:'New: coaching clinics every Tuesday', msg:'Drop in with a real conversation you want to practise. Book a slot from the Calendar.', tone:'Info', from:'2026-10-01T09:00', until:'2026-12-15T18:00' },
  { id:3, title:'Platform maintenance', msg:'Skillforge will be unavailable for 30 minutes on Saturday night.', tone:'Info', from:'2026-09-12T09:00', until:'2026-09-14T09:00' },
];
const annStatus = a => { const now = new Date(); if (a.from && now < new Date(a.from)) return 'Scheduled'; if (a.until && now > new Date(a.until)) return 'Ended'; return 'Live'; };

const blankFeatures = () => ({ selfComplete:false, linear:true, incorrect:true, correct:false, retake:true, cert:false, ack:false, survey:true, mandatory:false });
/* Category tree: category > sub category > sub-sub category. Admin and super admin manage it under Settings → Categories. */
const CATS0 = [
  { id:'c1', name:'Leadership', subs:[
    { id:'c1a', name:'Change management', subs:[{ id:'c1a1', name:'Leading change' }, { id:'c1a2', name:'Handling resistance' }] },
    { id:'c1b', name:'People leadership', subs:[{ id:'c1b1', name:'Coaching' }, { id:'c1b2', name:'1:1 conversations' }] } ] },
  { id:'c2', name:'Communication', subs:[
    { id:'c2a', name:'Feedback', subs:[{ id:'c2a1', name:'Giving feedback' }, { id:'c2a2', name:'Receiving feedback' }] },
    { id:'c2b', name:'Presentation skills', subs:[{ id:'c2b1', name:'Storytelling' }] },
    { id:'c2c', name:'Negotiation', subs:[{ id:'c2c1', name:'Deal making' }] } ] },
  { id:'c3', name:'Self-management', subs:[
    { id:'c3a', name:'Emotional intelligence', subs:[{ id:'c3a1', name:'Self-awareness' }] },
    { id:'c3b', name:'Productivity', subs:[{ id:'c3b1', name:'Time management' }] } ] },
  { id:'c4', name:'Collaboration', subs:[
    { id:'c4a', name:'Inclusion', subs:[{ id:'c4a1', name:'Inclusive leadership' }] } ] },
  { id:'c5', name:'Compliance', subs:[
    { id:'c5a', name:'Policies', subs:[{ id:'c5a1', name:'Code of conduct' }] } ] },
];
const COURSE_CATS = {
  change:{ catId:'c1', subId:'c1a', subsubId:'c1a1' }, feedback:{ catId:'c2', subId:'c2a', subsubId:'c2a1' }, oneonones:{ catId:'c1', subId:'c1b', subsubId:'c1b2' },
  negotiation:{ catId:'c2', subId:'c2c', subsubId:'c2c1' }, eq:{ catId:'c3', subId:'c3a', subsubId:'c3a1' }, present:{ catId:'c2', subId:'c2b', subsubId:'c2b1' },
  coaching:{ catId:'c1', subId:'c1b', subsubId:'c1b1' }, inclusive:{ catId:'c4', subId:'c4a', subsubId:'c4a1' }, energy:{ catId:'c3', subId:'c3b', subsubId:'c3b1' },
};
const catPath = (cats, c) => { const a = cats.find(x => x.id === c.catId), b = a && a.subs.find(x => x.id === c.subId), d = b && b.subs.find(x => x.id === c.subsubId); return { cat: a ? a.name : '', sub: b ? b.name : '', subsub: d ? d.name : '' }; };

/* Course availability: inactive, scheduled (before "live from"), ended (after "live until") or active. */
const availability = c => {
  const now = new Date();
  if (!c.active) return 'Inactive';
  if (c.availFrom && now < new Date(c.availFrom)) return 'Scheduled';
  if (c.availUntil && now > new Date(c.availUntil)) return 'Ended';
  return 'Active';
};
const fmtDateTime = v => v ? new Date(v).toLocaleString('en-US', { month:'short', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : '';

const ADMIN_COURSES0 = COURSES.map((c, i) => ({ id:c.id, title:c.title, cat:c.cat, desc:c.desc, color:VIVIDS[i % 7], status: i === 6 ? 'Draft' : 'Published', enrolled:c.learners,
  items: FLAT.map(l => l.type === 'Quiz' ? { kind:'quiz', quizId:1 } : { kind:'lesson', title:l.title }),
  features: { ...blankFeatures(), linear: i % 3 !== 2, incorrect: i % 2 === 0, mandatory: !!c.required, cert: !!c.required || i % 2 === 0 }, reports:{ learning:true, completion:true, progress:true, login: i % 2 === 0, coursewise:true },
  depts: i < 3 ? { 'Customer Success':true } : {}, due:'2026-10-31', enroll: i < 3 ? 'Role-based' : 'Manual', recert: i === 1 ? '12 months' : 'Never', lang:'English',
  ...COURSE_CATS[c.id], active:true, availFrom:'', availUntil:'', icon:null, banner:null,
  author:c.instructor, director:'', about:'', aud: i < 3 ? 'Departments' : 'Assign later', groups:{}, people:{} }));

/* User groups used when assigning a course to an audience. */
const GROUPS0 = [
  { id:'g1', name:'New managers', members:['Priya Raman','Hugo Laurent','Jonas Berg'] },
  { id:'g2', name:'Customer Success team', members:['Maya Okafor','Jonas Berg','Aisha Khan','Priya Raman'] },
  { id:'g3', name:'Q4 new joiners', members:['Nia Brooks','Sana Iqbal','Marco Bianchi'] },
  { id:'g4', name:'High-potential programme', members:['Aisha Khan','Grace Liu','Sana Iqbal'] },
];

/* A course built from uploads, in order: PDF → video → SCORM → assessment.
   It only counts as complete once the learner passes the assessment. */
/* ---------- LCMS: the upload hub for every module used in courses ---------- */
const MOD_TYPES = {
  // v41.11: the full LCMS type list. Keys are stored on each module, so existing keys never change; "label" is what people see.
  // pkg = a .zip played on the content site · embed = shown inside the LMS from another site · quiz = built on the question bank
  'SCORM / xAPI':     { label:'SCORM', kind:'scorm', glyph:'▦', bg:'#DBEAFE', fg:'#1E40AF', accept:'.zip,application/zip', hint:'SCORM 1.2 or SCORM 2004 package (.zip)', ok: f => /\.zip$/i.test(f.name), pkg:true },
  'Non-SCORM':        { label:'Non-SCORM (HTML5)', kind:'html', glyph:'</>', bg:'#E0E7FF', fg:'#3730A3', accept:'.zip,application/zip', hint:'HTML5 package (.zip) with an index.html, e.g. Articulate / Captivate web output', ok: f => /\.zip$/i.test(f.name), pkg:true },
  'xAPI / cmi5':      { label:'xAPI / cmi5', kind:'xapi', glyph:'⚙', bg:'#E0F2FE', fg:'#0C4A6E', accept:'.zip,application/zip', hint:'xAPI (tincan.xml) or cmi5 (cmi5.xml) package (.zip)', ok: f => /\.zip$/i.test(f.name), pkg:true },
  'H5P':              { label:'H5P', kind:'embed', glyph:'H', bg:'#DCFCE7', fg:'#166534', accept:'', hint:'Embed link of an H5P activity (H5P.com, H5P.org or your own H5P site)', link:true, embed:true },
  'Document':         { kind:'doc',  glyph:'▤', bg:'#FDECEC', fg:'#A63232', accept:'.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt', hint:'PDF, Word, PowerPoint, Excel or text', ok: f => /\.(pdf|docx?|pptx?|xlsx?|txt)$/i.test(f.name) },
  'Video':            { kind:'video', glyph:'▶', bg:'#CCFBF1', fg:'#115E59', accept:'video/*,.mp4,.webm,.mov', hint:'MP4, WebM or MOV', ok: f => f.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(f.name) },
  'Audio':            { label:'Podcast / audio', kind:'audio', glyph:'♪', bg:'#EDE9FE', fg:'#5B21B6', accept:'audio/*,.mp3,.wav,.m4a,.ogg', hint:'MP3, WAV, M4A or OGG', ok: f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg)$/i.test(f.name) },
  'YouTube / Vimeo':  { label:'YouTube / Vimeo', kind:'youtube', glyph:'▷', bg:'#FEE2E2', fg:'#B91C1C', accept:'', hint:'A YouTube or Vimeo video link', link:true },
  'Web link':         { label:'External content', kind:'link', glyph:'↗', bg:'#E0F2FE', fg:'#075985', accept:'', hint:'Any https:// page. Shown inside the LMS when the site allows it, otherwise in a new tab', link:true },
  'Image':            { kind:'image', glyph:'▣', bg:'#FEF3C7', fg:'#92400E', accept:'image/png,image/jpeg,image/gif,image/webp', hint:'PNG, JPG, GIF or WebP', ok: f => /^image\/(png|jpeg|gif|webp)$/.test(f.type) },
  'Assessment':       { kind:'quiz', glyph:'?', bg:'#FFEDD5', fg:'#9A3412', accept:'', hint:'Scored test built from the question bank', quiz:true },
  'Competency test':  { kind:'quiz', glyph:'◎', bg:'#FEF9C3', fg:'#854D0E', accept:'', hint:'Assessment that places the learner at a proficiency level for a competency', quiz:true, comp:true },
  'Feedback form':    { label:'Feedback', kind:'feedback', glyph:'★', bg:'#F3E8FF', fg:'#7E22CE', accept:'', hint:'Kirkpatrick L1–L4 form sent after a course or training', form:true, kp:true },
  'Survey':           { kind:'survey', glyph:'☰', bg:'#E0F2FE', fg:'#0369A1', accept:'', hint:'Questions learners answer as a course step (not scored)', form:true },
  'Checklist':        { kind:'checklist', glyph:'☑', bg:'#ECFCCB', fg:'#3F6212', accept:'', hint:'Items the learner ticks off, e.g. an on-the-job task list', list:true },
  'Assignment':       { kind:'assignment', glyph:'✎', bg:'#FFE4E6', fg:'#9F1239', accept:'', hint:'Learner submits work; a trainer accepts it or returns it with comments', asg:true },
  'Acknowledgment':   { kind:'ack', glyph:'✓', bg:'#FCE7F3', fg:'#9D174D', accept:'', hint:'A statement learners must agree to', text:true },
};
const modLabel = t => (MOD_TYPES[t] && MOD_TYPES[t].label) || t;
/* Course-step kinds: glyph, colours and the name learners see (shared by the course builder, course page and player). */
const KIND_EXTRA = { html:['</>', '#E0E7FF', '#3730A3', 'HTML5 package'], xapi:['⚙', '#E0F2FE', '#0C4A6E', 'xAPI / cmi5'], embed:['H', '#DCFCE7', '#166534', 'H5P activity'],
  youtube:['▷', '#FEE2E2', '#B91C1C', 'Video'], checklist:['☑', '#ECFCCB', '#3F6212', 'Checklist'], assignment:['✎', '#FFE4E6', '#9F1239', 'Assignment'],
  scorm:['▦', '#DBEAFE', '#1E40AF', 'SCORM'], link:['↗', '#E0F2FE', '#075985', 'External content'], audio:['♪', '#EDE9FE', '#5B21B6', 'Podcast / audio'] };
/* Sites that may be shown inside the LMS (the build writes the same list into the Content-Security-Policy frame-src).
 * Add your own in js/config.js: EMBED_ORIGINS: 'https://forms.office.com, https://web.microsoftstream.com' */
const EMBED_ORIGINS = ['https://www.youtube-nocookie.com', 'https://player.vimeo.com', 'https://h5p.org', 'https://*.h5p.com']
  .concat(String(((typeof window !== 'undefined' && window.SKILLFORGE_CONFIG) || {}).EMBED_ORIGINS || '').split(/[\s,]+/).filter(Boolean));
const Embed = {
  ok(url) { let u; try { u = new URL(url); } catch (e) { return false; } if (u.protocol !== 'https:') return false;
    return EMBED_ORIGINS.some(o => { const m = /^https:\/\/\*\.(.+)$/.exec(o); return m ? u.hostname.endsWith('.' + m[1]) : u.origin === o.replace(/\/$/, ''); }); },
  // YouTube / Vimeo page link -> privacy-friendly embed address (null if not a video link)
  video(url) { let u; try { u = new URL(String(url).trim()); } catch (e) { return null; } const h = u.hostname.replace(/^www\.|^m\./, '');
    let id = null;
    if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (h === 'youtube.com' || h === 'youtube-nocookie.com') id = u.searchParams.get('v') || (u.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/) || [])[1];
    if (id && /^[A-Za-z0-9_-]{6,15}$/.test(id)) return 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0';
    if (h === 'vimeo.com' || h === 'player.vimeo.com') { const v = (u.pathname.match(/(?:\/video)?\/(\d{5,12})/) || [])[1]; if (v) return 'https://player.vimeo.com/video/' + v; }
    return null; },
};
/* Map a module to the course-step shape the player uses. PDFs open inline; other documents download. */
const modKind = m => m.type === 'Document' ? (m.file && /\.pdf$/i.test(m.file.name || '') ? 'pdf' : 'doc') : MOD_TYPES[m.type].kind;
const itemFromModule = m => ({ kind: modKind(m), moduleId: m.id, title: m.title, quizId: m.quizId, mins: m.mins, qs: m.qs || null,
  ...(m.type === 'Competency test' ? { comp: m.comp || '', levels: m.levels || [] } : {}), ...(m.type === 'Checklist' ? { list: m.list || [] } : {}),
  ...(m.type === 'Assignment' ? { brief: m.text || '', allowLink: m.allowLink !== false } : {}), ...(m.type === 'YouTube / Vimeo' ? { embedUrl: Embed.video(m.url) || '' } : {}),
  file: ['Web link', 'H5P', 'YouTube / Vimeo'].includes(m.type) ? { src: m.url, name: m.url } : m.file || null, text: m.type === 'Assignment' ? '' : m.text || '' });
const LCMS0 = [
  { id:'m1', type:'Document', title:'Workplace safety handbook', desc:'Hazards, reporting and emergency exits.', mins:10, file:{ src:MEDIA_DIR + 'workplace-safety-handbook.pdf', name:'workplace-safety-handbook.pdf', size:5007 } },
  { id:'m2', type:'Video', title:'Safety briefing', desc:'A short briefing from the facilities team.', mins:2, file:{ src:MEDIA_DIR + 'acknowledging-loss.mp4', name:'safety-briefing.mp4', size:114828 } },
  { id:'m3', type:'SCORM / xAPI', title:'Safety scenarios', desc:'Two interactive scenarios. Reports completion automatically.', mins:8, file:{ src:'assets/scorm/workplace-safety/index.html', name:'workplace-safety-scorm.zip', launch:true, size:3298 } },
  { id:'m4', type:'Assessment', title:'Workplace safety check', desc:'', mins:10, quizId:4 },
  { id:'m5', type:'Assessment', title:'Change management check', desc:'', mins:10, quizId:1 },
  { id:'m6', type:'Assessment', title:'Feedback fundamentals', desc:'', mins:5, quizId:2 },
  { id:'m7', type:'Audio', title:'Pushback in a 1:1', desc:'A team member responds to a change.', mins:1, file:{ src:MEDIA_DIR + 'pushback-clip.mp3', name:'pushback-clip.mp3', size:73812 } },
  { id:'m8', type:'Image', title:'The change curve', desc:'How morale moves during a change.', mins:2, file:{ src:MEDIA_DIR + 'change-curve.svg', name:'change-curve.svg', size:1257 } },
  { id:'m9', type:'Video', title:'Acknowledging loss', desc:'A manager names what the team is giving up.', mins:2, file:{ src:MEDIA_DIR + 'acknowledging-loss.mp4', name:'acknowledging-loss.mp4', size:114828 } },
  { id:'m10', type:'Web link', title:'Company safety policy (intranet)', desc:'', mins:5, url:'https://example.com/safety-policy' },
  { id:'m11', type:'Acknowledgment', title:'Code of conduct acknowledgment', desc:'', mins:1, text:'I have read and will follow the company code of conduct.' },
].map((m, i) => ({ code:'MOD-' + String(i + 1).padStart(3, '0'), by:'Lena Fischer', updated:'2026-09-' + String(10 + i).padStart(2, '0'), ...m }));
const modById = id => LCMS0.find(m => m.id === id);

ADMIN_COURSES0.unshift({ id:'safety', title:'Workplace Safety Essentials', cat:'Compliance', catId:'c5', subId:'c5a', subsubId:'c5a1', color:'#F59E0B', status:'Published', enrolled:3,
  desc:'Spot hazards, report them and know what to do in an emergency.',
  about:'A short compliance course for everyone at the company. Read the handbook, watch the briefing, work through two interactive scenarios, then pass the safety check to complete the course.',
  author:'Lena Fischer', director:'Arjun Mehta',
  items:['m1', 'm2', 'm3', 'm4'].map(id => itemFromModule(modById(id))),
  features:{ ...blankFeatures(), linear:true, mandatory:true, cert:true }, reports:{ learning:true, completion:true, progress:true, login:false, coursewise:true },
  depts:{}, due:'2026-10-24', enroll:'Manual', recert:'12 months', lang:'English', active:true, availFrom:'', availUntil:'', icon:null, banner:null,
  aud:'User groups', groups:{ g2:true }, people:{} });
/* Auto-incremented course IDs */
ADMIN_COURSES0.forEach((c, i) => { c.code = 'CRS-' + (1001 + i); c.autoNew = false; c.essential = false; c.essentialDays = 30; c.essentialFrom = ''; });
/* Essential for new joiners: complete within 30 working days of joining (for people who joined from Jul 1, 2026). */
ADMIN_COURSES0.filter(c => c.id === 'safety' || c.id === 'feedback').forEach(c => { c.essential = true; c.essentialFrom = '2026-07-01'; });
const FEAT = [
  ['linear','Linear progression','Learners unlock each item only after finishing the one before.'],
  ['selfComplete','Learners can mark steps complete','Shows a “Mark complete” button on documents, images, links and lessons. When off, these steps complete automatically after a minimum viewing time.'],
  ['incorrect','Show incorrect answers','After a quiz attempt, learners can review the questions they got wrong.'],
  ['correct','Reveal correct answers','Also show the right answer and explanation for each question.'],
  ['retake','Allow quiz retakes','Learners can retry a failed quiz, up to the quiz attempt limit.'],
  ['cert','Certificate on completion','Issue a downloadable certificate when every item is complete.'],
  ['ack','Policy acknowledgment','Learners must confirm they have read and understood the content.'],
  ['survey','Post-course feedback survey','Collect a rating and comments when learners finish.'],
  ['mandatory','Mandatory','Shown as required on dashboards and tracked in compliance reports.'],
];
const COURSE_REPS = [['learning','User learning report'],['completion','Course completion report'],['progress','Course progress report'],['login','User login report'],['coursewise','Course-wise report']];
const PATHS0 = [
  { id:1, name:'New Manager Path', audience:'Newly promoted managers, first 90 days', courses:['oneonones','feedback','coaching','change'], auto:'Role', ordered:true, enrolled:46 },
  { id:2, name:'Customer Success Essentials', audience:'Everyone in Customer Success', courses:['oneonones','feedback','eq'], auto:'Department', ruleDept:'Customer Success', ordered:true, enrolled:58 },
  { id:3, name:'Leadership Accelerator', audience:'Senior ICs nominated by their manager', courses:['change','negotiation','inclusive','coaching','present'], auto:'Manual', ordered:false, enrolled:21 },
];
const RDEF = {
  kirkpatrick:{ name:'Kirkpatrick L1–L4 analysis', short:'Results per level, schedule and sending', desc:'Kirkpatrick feedback for each course and training.', dot:'#7E22CE', cols:['Course'], grid:'1fr' },   // v36: moved here from Settings › Feedback responses
  usercourses:{ name:'User course completion', short:'What each person completed, with evaluation %', desc:'Every course each person has completed, when, and their evaluation score (best assessment %) where the course has an assessment. One row per person per completed course.', dot:'#0F766E', cols:['TEAMMATE','EMPLOYEE ID','COURSE','COMPLETED ON','EVALUATION %','ATTEMPTS','RESULT'], grid:'minmax(160px,1.3fr) 110px minmax(200px,1.8fr) 120px minmax(120px,1fr) 90px 110px' },
  kpfeedback:{ name:'Feedback responses (Kirkpatrick)', short:'Every L1–L4 request and answer', desc:'Each feedback request sent for a course or training: form, level, learner, recipient, due date, status and the average rating given. Forms are built in LCMS.', dot:'#7E22CE', cols:['COURSE / TRAINING','FORM','LEVEL','LEARNER','SENT TO','DUE','STATUS','AVG RATING'], grid:'minmax(180px,1.5fr) minmax(160px,1.3fr) 60px minmax(140px,1fr) minmax(140px,1fr) 100px 110px 100px' },
  users:{ name:'User report', short:'Every account, active or deactivated', desc:'All users with their status (active, invited or deactivated), role, department, manager, joining date and last sign-in.', dot:'#DB2777', cols:['USER','EMPLOYEE ID','DEPARTMENT','ROLE','STATUS','JOINED','LAST SIGN-IN'], grid:'minmax(170px,1.5fr) 100px minmax(130px,1fr) minmax(120px,1fr) 110px 110px minmax(100px,.8fr)' },
  asmSheet:{ name:'Assessment result sheet', short:'Every attempt on one assessment', desc:'All attempts on the chosen assessment between two date-times: who, when, how long, score and result. The CSV adds a column per question.', dot:'#7C3AED', cols:['LEARNER','COURSE','ATTEMPT','STARTED','SUBMITTED','TIME','CORRECT','SCORE','RESULT'], grid:'minmax(150px,1.3fr) minmax(150px,1.3fr) 70px 140px 140px 70px 80px minmax(110px,1fr) 100px' },
  userAsm:{ name:'User assessment results', short:'Courses and assessments one person completed', desc:'Every course the chosen person completed and every assessment attempt they made, between two date-times.', dot:'#0D9488', cols:['TYPE','NAME','COURSE','DATE','ATTEMPT','SCORE','RESULT'], grid:'110px minmax(180px,1.6fr) minmax(150px,1.2fr) 140px 80px minmax(110px,1fr) 110px' },
  allcompletion:{ name:'All course completion', short:'Every course and module, for every teammate', desc:'Each teammate’s assigned courses with assigned date, start and completion dates, completion %, assessment attempts and best score. The CSV has one row per module.', dot:'#0369A1', cols:['TEAMMATE','COURSE','ASSIGNED','DUE','STARTED','COMPLETED','COMPLETION','ATTEMPTS','BEST SCORE','STATUS'], grid:'minmax(150px,1.3fr) minmax(170px,1.6fr) 92px 92px 92px 100px minmax(110px,1fr) 80px 90px 110px' },
  learning:{ name:'User learning report', short:'Courses, hours and scores per person', desc:'Assigned and completed courses, learning time in the chosen period (estimated from the length of the modules completed), average assessment score and last activity, from the learning records.', dot:'#7C5CFF', cols:['USER','DEPARTMENT','ASSIGNED','COMPLETED','HOURS (EST.)','AVG SCORE','LAST ACTIVE'], grid:'minmax(150px,1.4fr) minmax(0,1.2fr) 80px 96px 104px minmax(0,1.3fr) minmax(0,1fr)' },
  completion:{ name:'Course completion report', short:'Who finished each course', desc:'Per course, for the people in the filter: assignments, completions (imported completions included), average days from assignment to completion and certificates issued. All time.', dot:'#08AE6E', cols:['COURSE','ENROLLED','COMPLETED','COMPLETION','AVG TIME','CERTIFICATES'], grid:'minmax(200px,2fr) 90px 100px minmax(0,1.5fr) 100px 110px' },
  progress:{ name:'Course progress report', short:'Where each learner is right now', desc:'Current progress on assigned courses, with overdue flags.', dot:'#0066A1', cols:['USER','COURSE','PROGRESS','MODULES','STATUS','DUE'], grid:'minmax(150px,1.3fr) minmax(0,1.6fr) minmax(0,1.4fr) 80px 120px 70px' },
  login:{ name:'User login report', short:'Sign-in activity', desc:'Sign-ins recorded since v29 (count, first recorded, usual method). People who have not signed in since then show their last sign-in from the account record. Session length is not measured.', dot:'#2563EB', cols:['USER','DEPARTMENT','LAST SIGN-IN','SIGN-INS','FIRST RECORDED','METHOD'], grid:'minmax(150px,1.4fr) minmax(0,1.3fr) minmax(0,1fr) 80px 110px minmax(0,1fr)' },
  coursewise:{ name:'Course-wise report', short:'Enrollment funnel per course', desc:'Per course: not started, in progress and completed (they add up to enrolled), average assessment score and how many are overdue. All time.', dot:'#DB2777', cols:['COURSE','ENROLLED','NOT STARTED','IN PROGRESS','COMPLETED','AVG SCORE','OVERDUE'], grid:'minmax(200px,2fr) 90px 100px 100px 100px minmax(0,1.3fr) 70px' },
  quiz:{ name:'Quiz performance report', short:'Pass rates and hardest questions', desc:'Attempts submitted in the chosen period: pass rate, average score and the most-missed question (asked at least 5 times).', dot:'#22C55E', cols:['QUIZ','ATTEMPTS','PASS RATE','AVG SCORE','MOST-MISSED QUESTION'], grid:'minmax(180px,1.4fr) 90px minmax(0,1.3fr) 90px minmax(0,2fr)' },
  compliance:{ name:'Certification & compliance', short:'Valid, expiring and expired', desc:'Mandatory, essential and re-certified courses: when each person completed them and when that expires (re-certification period set on the course). Expired completions are flagged; re-enrolling them is a separate step.', dot:'#FF6B4A', cols:['USER','COURSE','COMPLETED','EXPIRES / DUE','STATUS'], grid:'minmax(150px,1.3fr) minmax(0,1.6fr) minmax(0,1fr) minmax(0,1fr) 130px' },
};
const GENDERS = ['Female', 'Male', 'Non-binary', 'Prefer not to say'];
const USER_GENDER = ['Female','Male','Female','Female','Male','Male','Female','Male','Female','Male','Female','Male','Male','Female','Male','Female','Male','Female','Male','Female'];
const USER_TITLE = { Learner:'Associate', Instructor:'Trainer', Manager:'Team Manager', Admin:'L&D Administrator', 'Super admin':'Platform Owner' };
const USER_TYPE = { Learner:'Learner', Instructor:'Trainer', Manager:'Learner', Admin:'Admin', 'Super admin':'Admin' };
const USER_JOINED = ['2022-03-14','2021-07-01','2023-01-09','2019-11-18','2020-05-04','2022-09-12','2018-02-26','2017-08-21','2024-04-15','2023-06-05','2021-10-11','2020-01-20','2022-12-01','2026-09-28'];
/* Recent joiners (essential-training rule applies from Jul 1, 2026). */
const JOIN_OVERRIDE = { 'Ishaan Kapoor':'2026-08-03', 'Meera Nair':'2026-08-10', 'Karan Malhotra':'2026-09-21', 'Ananya Rao':'2026-09-14' };
const USERS0 = [['Maya Okafor','Learner','Customer Success','Active','Today 08:12'],['Jonas Berg','Learner','Customer Success','Active','Today 09:30'],['Aisha Khan','Learner','Customer Success','Active','Yesterday'],['Priya Raman','Manager','Customer Success','Active','Today 07:55'],['Daniel Reyes','Instructor','Learning & Development','Active','Today 10:02'],['Kofi Mensah','Instructor','Learning & Development','Active','2 days ago'],['Lena Fischer','Admin','Learning & Development','Active','Today 08:40'],['Arjun Mehta','Super admin','IT','Active','Today 08:05'],['Sana Iqbal','Learner','Sales','Active','Today 11:14'],['Marco Bianchi','Learner','Engineering','Active','3 days ago'],['Grace Liu','Learner','Operations','Active','Yesterday'],['Hugo Laurent','Manager','Marketing','Active','Today 09:02'],['Felix Wong','Learner','Finance','Deactivated','Aug 14'],['Nia Brooks','Learner','Sales','Invited','Never'],['Ishaan Kapoor','Learner','Customer Success','Active','Today 08:47'],['Meera Nair','Learner','Customer Success','Active','Yesterday'],['Rohan Desai','Learner','Sales','Active','Today 09:15'],['Fatima Sheikh','Learner','Operations','Active','2 days ago'],['Karan Malhotra','Learner','Sales','Active','Today 10:20'],['Ananya Rao','Learner','Operations','Active','Yesterday']]
  .map((r, i) => ({ id:i + 1, name:r[0], email: r[0].toLowerCase().split(' ').join('.') + '@example.com', role:USER_TYPE[r[1]], dept:r[2], status: r[3] === 'Invited' ? 'Active' : r[3], lastLogin:r[4], manager: r[1] === 'Learner' ? 'Priya Raman' : r[1] === 'Manager' ? 'Lena Fischer' : 'None',
    empId:'NW-' + (1001 + i), phone:'+1 555 01' + String(20 + i * 7).padStart(2, '0'), gender: USER_GENDER[i] || 'Prefer not to say', terms: r[3] !== 'Invited', designation: USER_TITLE[r[1]], joined: JOIN_OVERRIDE[r[0]] || USER_JOINED[i % USER_JOINED.length] }));
const AUTOS0 = [
  { id:'due', label:'Due-date reminders', desc:'Email and in-app reminder 7 days and 1 day before a due date.', on:true },
  { id:'overdue', label:'Overdue escalation', desc:'Notify the learner\'s manager when an assignment is 3 days overdue.', on:true },
  { id:'expiry', label:'Certification expiry alerts', desc:'Warn learners and managers 30 days before a certificate expires.', on:true },
  { id:'reenroll', label:'Automatic re-enrollment', desc:'Reassign the course on the day a certificate expires.', on:true },
  { id:'welcome', label:'New hire onboarding', desc:'Enroll new accounts in their department\'s learning path on day one.', on:true },
  { id:'digest', label:'Weekly manager digest', desc:'Monday summary of team progress for every manager.', on:false },
  { id:'inactive', label:'Inactivity nudge', desc:'Remind learners who have not signed in for 14 days.', on:false },
];
const INTEG0 = [
  { id:'okta', name:'Okta', cat:'Single sign-on (SAML)', on:true }, { id:'entra', name:'Microsoft Entra ID', cat:'Single sign-on', on:false },
  { id:'zinghr', name:'ZingHR', cat:'HRMS · employee master sync', on:true }, { id:'bamboo', name:'BambooHR', cat:'HRIS sync', on:false },
  { id:'zoom', name:'Zoom', cat:'Virtual classroom · attendance', on:true }, { id:'teams', name:'Microsoft Teams', cat:'Virtual classroom & notifications', on:false },
  { id:'slack', name:'Slack', cat:'Notifications & nudges', on:true }, { id:'scorm', name:'SCORM / xAPI', cat:'SCORM 1.2, 2004 and xAPI content', on:true },
  { id:'linkedin', name:'LinkedIn Learning', cat:'Content library', on:false },
];
const AUDIT = [
  { at:'Oct 3 · 10:42', who:'Lena Fischer', action:'Published course', target:'Leading Through Change v3' },
  { at:'Oct 3 · 10:15', who:'Arjun Mehta', action:'Changed permission', target:'Managers · View all reports → off' },
  { at:'Oct 3 · 09:58', who:'Lena Fischer', action:'Imported questions', target:'12 questions · coaching_bank.csv' },
  { at:'Oct 3 · 09:31', who:'Lena Fischer', action:'Deactivated account', target:'Felix Wong' },
  { at:'Oct 2 · 17:20', who:'Daniel Reyes', action:'Edited quiz', target:'Change management check' },
  { at:'Oct 2 · 16:04', who:'Priya Raman', action:'Assigned course', target:'Negotiation Essentials · 7 people' },
  { at:'Oct 2 · 14:47', who:'Arjun Mehta', action:'Connected integration', target:'ZingHR employee master' },
  { at:'Oct 2 · 11:12', who:'Lena Fischer', action:'Exported report', target:'Course completion report · CSV' },
  { at:'Oct 1 · 15:30', who:'Lena Fischer', action:'Created account', target:'Nia Brooks · Learner' },
  { at:'Oct 1 · 09:05', who:'System', action:'Auto re-enrolled', target:'4 users · Code of Conduct 2026' },
];
/* What each user type can do (read-only reference shown under Settings → User types & access). Columns: Learner, Trainer, Admin. */
const PERMS0 = [['Take assigned courses and assessments',[1,1,1]],['Browse catalog and learning paths',[1,1,1]],['Calendar and discussions',[1,1,1]],
  ['Batch management (own batches; admins all)',[0,1,1]],['Assign and unassign courses',[0,1,1]],['Give extra assessment attempts',[0,1,1]],['Rate written answers (Gradebook)',[0,1,1]],['Course builder',[0,0,1]],
  ['Question bank, quizzes and LCMS',[0,0,1]],['Course catalog and categories',[0,0,1]],['Users and accounts',[0,0,1]],['Reports, analytics and audit log',[0,0,1]],['Announcements and automations',[0,0,1]],['Integrations and branding',[0,0,1]]];
const NOTIFS = [
  { t:'Giving Feedback That Lands is due in 5 days', time:'Today', kind:'due' },
  { t:'Daniel Reyes replied to your discussion', time:'1h ago', kind:'reply' },
  { t:'Your Foundations of Management certificate expires Dec 3', time:'Yesterday', kind:'cert' },
  { t:'Priya Raman assigned you Negotiation Essentials', time:'2 days ago', kind:'assign' },
];

/* ---------- Dates ---------- */
const dateKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const TODAY = new Date();
const TODAY_KEY = dateKey(TODAY);
const shortDate = key => typeof Fmt !== 'undefined' ? Fmt.short(key) : new Date(key + 'T12:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' });
const daysUntil = key => Math.round((new Date(key + 'T12:00:00') - new Date(TODAY_KEY + 'T12:00:00')) / 86400000);
// Single source of truth for course due dates (home, course page, calendar).
const DUE_DATES = { feedback:'2026-10-08', change:'2026-10-16', present:'2026-10-30', negotiation:'2026-11-14' };
