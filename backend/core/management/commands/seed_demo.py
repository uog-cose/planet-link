from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from core.models import *
from datetime import timedelta
from django.utils import timezone
class Command(BaseCommand):
 def handle(self,*args,**kwargs):
  prog,_=Programme.objects.get_or_create(name='Youth Quest Pilot',defaults={'location':'Cumbernauld','theme':'neon','target_xp':500000,'attendance_points':25,'streak_rules':[{'days':3,'multiplier':1.3},{'days':7,'multiplier':1.5},{'days':14,'multiplier':2.0}],'milestones':[{'tier':'silver','xp':1000},{'tier':'gold','xp':2500},{'tier':'diamond','xp':5000}]})
  if not prog.milestones: prog.milestones=[{'tier':'silver','xp':1000},{'tier':'gold','xp':2500},{'tier':'diamond','xp':5000}]; prog.save(update_fields=['milestones'])
  for username,role,gamertag,xp in [('alex','youth','Nova',1240),('worker','worker','Coach',0),('admin','admin','Admin',0)]:
   u,_=User.objects.get_or_create(username=username,defaults={'is_staff':role!='youth'})
   u.set_password('YouthQuest123!');u.is_active=True;u.save()
   p,_=Profile.objects.get_or_create(user=u,defaults={'role':role,'gamertag':gamertag,'current_xp':xp,'lifetime_xp':xp,'level':xp//500+1,'streak':7,'notifications_opt_in':True,'push_notifications_opt_in':False,'public_opt_in':True})
   p.role=role;p.gamertag=gamertag;p.programme=prog
   if role != 'youth': p.notifications_opt_in=False; p.push_notifications_opt_in=False
   elif username == 'alex': p.notifications_opt_in=True
   p.save()
   ProgrammeMembership.objects.get_or_create(user=u,programme=prog)
  group,_=Group.objects.get_or_create(name='Trailblazers',programme=prog,defaults={'tier_targets':[]}); group.xp=18200;group.save();group.members.add(Profile.objects.get(user__username='alex'))
  for n,d,r in [('First Spark','Complete your first challenge',100),('Community Builder','Help the group move forward',250),('Creative Explorer','Try a new skill',150)]:
   b,_=Badge.objects.get_or_create(name=n,defaults={'description':d,'icon':'sparkles'}); ProfileBadge.objects.get_or_create(profile=Profile.objects.get(user__username='alex'),badge=b)
  for n,d,r in [('Make a Mark','Create something original',50),('Team Player','Support a group activity',75),('Try Something New','Complete a new challenge',100)]:
   s,_=Skill.objects.get_or_create(name=n,programme=prog,defaults={'description':d,'xp_reward':r});ProfileSkill.objects.get_or_create(profile=Profile.objects.get(user__username='alex'),skill=s,defaults={'progress':70})
  Challenge.objects.get_or_create(title='Capture the Moment',programme=prog,defaults={'kind':'drawing','description':'Take part in today’s activity and earn XP.','xp_reward':120,'due_at':timezone.now()+timedelta(days=2)})
  Challenge.objects.get_or_create(title='Team Boost',programme=prog,defaults={'description':'Complete a group task together.','xp_reward':180,'due_at':timezone.now()+timedelta(days=5)})
  GameAssignment.objects.get_or_create(game=Challenge.objects.get(title='Capture the Moment'),target_profile=Profile.objects.get(user__username='alex'),defaults={'assigned_by':User.objects.get(username='worker')})
  for reward_name,description,cost,awards in [
   ('Mystery Box','A surprise scratch-card reward.',300,[{'name':'10 XP','xp':10,'quantity':10,'remaining':10,'available':True},{'name':'25 XP','xp':25,'quantity':5,'remaining':5,'available':True},{'name':'50 XP','xp':50,'quantity':2,'remaining':2,'available':True}]),
   ('Studio Pass','Unlock a creative activity reward.',500,[{'name':'25 XP','xp':25,'quantity':8,'remaining':8,'available':True},{'name':'75 XP','xp':75,'quantity':3,'remaining':3,'available':True}])
  ]:
   reward,_=Reward.objects.get_or_create(name=reward_name,programme=prog,defaults={'description':description,'cost_xp':cost,'awards':awards})
   if not reward.awards:
    reward.awards=awards; reward.save(update_fields=['awards'])
  alex_profile=Profile.objects.get(user__username='alex')
  mystery=Reward.objects.get(name='Mystery Box',programme=prog)
  RewardAssignment.objects.update_or_create(reward=mystery,target_profile=alex_profile,defaults={'assigned_by':User.objects.get(username='worker'),'active':True})
  # Default demo cooking skill: three practical stages with visible XP/reward milestones.
  alex_profile=Profile.objects.get(user__username='alex')
  worker_user=User.objects.get(username='worker')
  cooking,_=Skill.objects.get_or_create(name='Cooking stages',programme=prog,defaults={'description':'Build confidence in the kitchen, one stage at a time.','xp_reward':150,'activity_url':'https://www.nhs.uk/healthier-families/recipes/','active':True})
  cooking.description='Build confidence in the kitchen, one stage at a time.'
  cooking.activity_url='https://www.nhs.uk/healthier-families/recipes/'
  cooking.save(update_fields=['description','activity_url'])
  stage_defs=[('Cold cooking',25,50,'Studio Pass'),('Grill cooking',60,75,'Mystery Box'),('Plating',100,100,'Studio Pass')]
  cooking.milestone_records.all().delete()
  for order,(stage,progress,xp,reward_name) in enumerate(stage_defs):
   stage_reward=Reward.objects.filter(programme=prog,name=reward_name,active=True).first()
   SkillMilestone.objects.create(skill=cooking,name=stage,progress=progress,xp=xp,reward=stage_reward,order=order)
  ProfileSkill.objects.get_or_create(profile=alex_profile,skill=cooking,defaults={'progress':0})
  SkillAssignment.objects.get_or_create(skill=cooking,target_profile=alex_profile,defaults={'assigned_by':worker_user,'active':True})
  # A six-step sequence-memory game is assigned to the demo young person by default.
  sequence,_=Challenge.objects.get_or_create(title='Sequence Memory — 6 steps',programme=prog,defaults={'kind':'sequence','description':'Watch the six-step sequence, then repeat it in the correct order.','xp_reward':100,'start_at':timezone.now()-timedelta(minutes=1),'end_at':timezone.now()+timedelta(days=365),'shape':'circle','score_ranges':[{'min':6,'xp':100},{'min':4,'xp':60},{'min':2,'xp':30},{'min':1,'xp':10}],'game_config':{'difficulty':6,'scoring':[{'min':6,'xp':100},{'min':4,'xp':60},{'min':2,'xp':30},{'min':1,'xp':10}]}})
  sequence.kind='sequence'; sequence.game_config={**(sequence.game_config or {}),'difficulty':6,'scoring':[{'min':6,'xp':100},{'min':4,'xp':60},{'min':2,'xp':30},{'min':1,'xp':10}]}; sequence.save(update_fields=['kind','game_config'])
  GameAssignment.objects.get_or_create(game=sequence,target_profile=alex_profile,defaults={'assigned_by':worker_user})
  Notification.objects.get_or_create(profile=Profile.objects.get(user__username='alex'),title='New challenge unlocked',defaults={'body':'Capture the Moment is ready when you are.','kind':'challenge'})
  self.stdout.write(self.style.SUCCESS('Demo data seeded.'))
