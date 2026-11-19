import bpy, math
from mathutils import Vector
def lin(h):
    h=h.lstrip('#'); f=lambda c:(c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4)
    return tuple(f(int(h[i:i+2],16)/255) for i in (0,2,4))
def mat(name,rgb,rough=0.22,coat=1.0):
    m=bpy.data.materials.new(name); m.use_nodes=True
    b=m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*rgb,1); b.inputs['Roughness'].default_value=rough
    for k in ('Coat Weight','Clearcoat'):
        if k in b.inputs: b.inputs[k].default_value=coat
    return m
def ball(loc,scale,m,rot=(0,0,0)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64,ring_count=32,location=loc,rotation=rot)
    o=bpy.context.object; o.scale=scale; bpy.ops.object.shade_smooth(); o.data.materials.append(m); return o
def knot(loc,m,r=0.055):
    ball((loc[0],loc[1]+0.02,loc[2]),(r,r*1.2,r),m)
    bpy.ops.mesh.primitive_torus_add(major_radius=r*1.15,minor_radius=r*0.45,location=(loc[0],loc[1]-r*0.9,loc[2]),rotation=(math.pi/2,0,0))
    o=bpy.context.object; bpy.ops.object.shade_smooth(); o.data.materials.append(m)
def build(kind,color,ears,leg,tail,out):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc=bpy.context.scene
    C=mat('c',lin(color)); D=mat('d',(0.01,0.01,0.01),0.15); W=mat('w',(1,1,1),0.1)
    zb=leg*2-0.12+0.3
    ball((0,0.6,zb),(0.3,0.62,0.3),C)
    for s in (1,-1):
        ball((0.25*s,0.02,leg),(0.2,0.2,leg),C)
        ball((0.27*s,1.1,leg),(0.2,0.2,leg),C)
    ball((0,0.02,zb+0.42),(0.2,0.2,0.34),C)
    zh=zb+0.86
    if kind=='dog':
        ball((0,-0.34,zh),(0.27,0.52,0.27),C)
        knot((0,-0.86,zh),C)
        ex,ey,ez=0.13,-0.55,zh+0.2
        if ears=='up':
            for s in (1,-1): ball((0.2*s,0.08,zh+0.5),(0.16,0.16,0.42),C,(0,0.22*s,0))
        elif ears=='big':
            for s in (1,-1): ball((0.3*s,0.08,zh+0.5),(0.2,0.16,0.48),C,(0,0.42*s,0))
        elif ears=='down':
            for s in (1,-1): ball((0.42*s,0.0,zh-0.12),(0.15,0.16,0.38),C,(0,-0.25*s,0))
        else:
            for s in (1,-1): ball((0.45*s,0.0,zh-0.3),(0.16,0.17,0.56),C,(0,-0.18*s,0))
    else:
        ball((0,-0.18,zh+0.05),(0.44,0.42,0.4),C)
        knot((0,-0.6,zh-0.02),C,0.04)
        ex,ey,ez=0.17,-0.5,zh+0.17
        h=0.34 if ears=='up' else 0.2
        for s in (1,-1):
            bpy.ops.mesh.primitive_cone_add(vertices=48,radius1=0.17,radius2=0.03,depth=h,location=(0.26*s,-0.08,zh+0.4+h/2-0.06),rotation=(0,0.3*s,0))
            o=bpy.context.object; bpy.ops.object.shade_smooth(); o.data.materials.append(C)
            ball((0.26*s+0.3*s*(h/2)*0.9,-0.08,zh+0.4+h-0.08),(0.045,0.045,0.045),C)
    for s in (1,-1):
        ball((ex*s,ey,ez),(0.055,0.04,0.065),D)
        ball((ex*s+0.018,ey-0.035,ez+0.022),(0.016,0.012,0.016),W)
    if tail=='up': ball((0.0,1.2,zb+0.75),(0.09,0.09,0.42),C,(0.25,0,0))
    elif tail=='side': ball((0.52,1.05,zb+0.5),(0.09,0.09,0.6),C,(0.2,0.75,0))
    else: ball((0.0,1.22,zb+0.5),(0.1,0.1,0.22),C,(0.6,0,0))
    bpy.ops.mesh.primitive_plane_add(size=40,location=(0,0,0)); bpy.context.object.is_shadow_catcher=True
    w=bpy.data.worlds.new('w'); sc.world=w; w.use_nodes=True
    w.node_tree.nodes['Background'].inputs[0].default_value=(1,0.98,0.94,1); w.node_tree.nodes['Background'].inputs[1].default_value=0.55
    for loc,e,size in (((-3,-5,5.5),700,4),((4,-4,2.5),180,6)):
        bpy.ops.object.light_add(type='AREA',location=loc); L=bpy.context.object; L.data.energy=e; L.data.size=size
        L.rotation_euler=(Vector((0,0.2,1.2))-L.location).to_track_quat('-Z','Y').to_euler()
    bpy.ops.object.camera_add(location=(0,-9,1.9)); cam=bpy.context.object
    cam.rotation_euler=(Vector((0,0.2,1.28))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.lens=95; sc.camera=cam
    sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=48; sc.cycles.use_denoising=True
    sc.render.film_transparent=True; sc.view_settings.view_transform='Standard'
    sc.render.resolution_x=420; sc.render.resolution_y=500; sc.render.filepath=out
    bpy.ops.render.render(write_still=True)
V=[('dog','#E3B565','down',0.42,'up'),('dog','#3A2A20','up',0.44,'up'),('dog','#A6522A','long',0.24,'up'),('dog','#E08A32','big',0.26,'short'),
   ('cat','#E38B3A','up',0.36,'side'),('cat','#8C9199','small',0.34,'side'),('cat','#1E1C1F','up',0.38,'side'),('cat','#F1E7D6','up',0.36,'side')]
for i,v in enumerate(V): build(*v,f'out/pet_{i}.png')
