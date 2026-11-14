# Persona sources

MakeHuman hm08 mesh and bundled target assets from the user-supplied official MPFB 2.0.18 archive. Mesh header explicitly dedicates this asset to CC0 (September 2020).
Copyright holders at dedication: Data Collection AB, Joel Palmius, Jonas Hauquier.
https://www.makehumancommunity.org/about/license.html
https://github.com/makehumancommunity/makehuman/blob/master/LICENSE.ASSETS.md

Nexus modifications: female phenotype, head/clavicle crop, area-weighted surface sampling, combined eyelid and mouth morphs, cyan point shading. No MPFB application code is shipped in Nexus.
Environment PNG: generated for this project, separate from the model.

## Active runtime: user-supplied Hi3D

Source: `Hi3D_Untitled_allparts_20261111_184233.glb`, supplied by the user. Attribution/license must not be inherited from MakeHuman; redistribution rights have not been independently verified. Original source stays outside public assets. SHA-256, selected geometry counts, and capability metadata are in `hi3d-head.json`. The build script selects the largest connected component, computes smooth normals and samples its surface; it does not invent texture, hair or facial-rig data.
