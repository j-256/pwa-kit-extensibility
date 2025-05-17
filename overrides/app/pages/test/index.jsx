import React from 'react'
import {useLocation} from 'react-router-dom'

const Test = () => {
    const {search} = useLocation()
    const params = new URLSearchParams(search)
    const myParam = params.get('param')

    return (
        <div style={{textAlign: 'center', fontSize: '4rem'}}>
            Test route
            <div style={{fontSize: '2rem', marginTop: '2rem'}}>
                Query param: {myParam}
            </div>
        </div>
    )
}

export default Test
