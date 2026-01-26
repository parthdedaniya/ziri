 

export function useCedarSchema() {
 
  const jsonToCedar = (jsonSchema: any): string => {
    if (!jsonSchema || typeof jsonSchema !== 'object') {
      return ''
    }

    let cedar = ''
    
 
    if (jsonSchema.commonTypes) {
      for (const [typeName, typeDef] of Object.entries(jsonSchema.commonTypes)) {
        cedar += `  type ${typeName} = {\n`
        const shape = (typeDef as any).shape
        if (shape && shape.attributes) {
          for (const [attrName, attrDef] of Object.entries(shape.attributes)) {
            const attr = attrDef as any
            const optional = attr.optional ? '?' : ''
            const typeStr = convertTypeToCedar(attr.type, attr)
            cedar += `    "${attrName}"${optional}: ${typeStr},\n`
          }
          cedar = cedar.slice(0, -2) + '\n' // Remove trailing comma
        }
        cedar += '  };\n\n'
      }
    }
    
 
    const entityTypes = jsonSchema['']?.entityTypes || jsonSchema.entityTypes
    if (entityTypes) {
      for (const [entityType, typeDef] of Object.entries(entityTypes)) {
        cedar += `  entity ${entityType}`
        
        if (typeDef && typeof typeDef === 'object' && 'shape' in typeDef) {
          const shape = (typeDef as any).shape
          if (shape && shape.attributes) {
            cedar += ' {\n'
            for (const [attrName, attrDef] of Object.entries(shape.attributes)) {
              const attr = attrDef as any
              const optional = attr.optional ? '?' : ''
              const typeStr = convertTypeToCedar(attr.type, attr)
              cedar += `    "${attrName}"${optional}: ${typeStr},\n`
            }
            cedar = cedar.slice(0, -2) + '\n' // Remove trailing comma
            cedar += '  }'
          }
        }
        cedar += ';\n\n'
      }
    }

 
    const actions = jsonSchema['']?.actions || jsonSchema.actions
    if (actions) {
      for (const [actionName, actionDef] of Object.entries(actions)) {
        cedar += `  action "${actionName}"`
        
        if (actionDef && typeof actionDef === 'object' && 'appliesTo' in actionDef) {
          const appliesTo = (actionDef as any).appliesTo
          cedar += ' appliesTo {\n'
          
          if (appliesTo.principalTypes) {
            cedar += `    principal: [${appliesTo.principalTypes.map((t: string) => t).join(', ')}],\n`
          }
          if (appliesTo.resourceTypes) {
            cedar += `    resource: [${appliesTo.resourceTypes.map((t: string) => t).join(', ')}],\n`
          }
          if (appliesTo.context) {
            cedar += `    context: ${appliesTo.context}\n`
          }
          
          cedar = cedar.replace(/,\n$/, '\n') // Remove trailing comma
          cedar += '  }'
        }
        cedar += ';\n\n'
      }
    }

    return cedar.trim()
  }

 
  const cedarToJson = (cedarSchema: string): any => {
 
 
    try {
 
 
      return null
    } catch (e) {
      console.error('Failed to parse Cedar schema:', e)
      return null
    }
  }

  const convertTypeToCedar = (type: string, attr: any): string => {
    switch (type) {
      case 'String':
        return '__cedar::String'
      case 'Long':
        return '__cedar::Long'
      case 'Boolean':
        return '__cedar::Bool'
      case 'Extension':
        if (attr.name) {
          return `__cedar::${attr.name}`
        }
        return '__cedar::String'
      case 'Set':
        if (attr.element) {
          const elementType = convertTypeToCedar(attr.element.type || 'String', attr.element)
          return `Set<${elementType}>`
        }
        return 'Set<__cedar::String>'
      case 'Record':
        return 'Record'
      default:
        return `__cedar::${type}`
    }
  }

  return {
    jsonToCedar,
    cedarToJson
  }
}
